/**
 * 필수 약관을 붙잡는 화면. **닫을 수 없어서** 여기서 막히면 앱 전체가 막힌다.
 *
 * jsdom 은 레이아웃을 계산하지 않는다 — `offsetParent` 가 언제나 null 이라 포커스 트랩이
 * "보이는 요소가 하나도 없다"고 판단한다. 실제 브라우저와 같은 판정을 받도록 아래에서
 * `offsetParent` 를 부모 요소로 흉내 낸다. 높이·잘림은 계산되지 않으므로 스크롤은
 * 클래스 계약으로만 못 박는다.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TermsReconsentDialog } from "@/components/terms/TermsReconsentDialog";
import { termsContentHref, type MyTermsConsent } from "@/lib/termsApi";

const mockFetchActive = jest.fn();
const mockSubmit = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock("@/lib/termsApi", () => {
  const actual = jest.requireActual("@/lib/termsApi");
  return {
    ...actual,
    fetchActiveTerms: (...args: unknown[]) => mockFetchActive(...args),
    submitTermsConsents: (...args: unknown[]) => mockSubmit(...args),
  };
});

const originalOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
});

afterAll(() => {
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchActive.mockResolvedValue([]);
  mockSubmit.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue({ data: null, ok: true, status: 200 });
});

/**
 * 로그인 화면으로 나갔는가.
 *
 * jsdom 은 실제 이동을 하지 않는다 — `window.location.href` 는 그대로 있고, 대신 가상 콘솔이
 * "Not implemented: navigation" 을 `console.error` 로 흘린다. `location` 은 재정의할 수 없어
 * (unforgeable) 스텁을 끼울 수도 없으므로 이동 시도는 그 신호로 읽는다.
 */
function didNavigate(consoleError: jest.SpyInstance) {
  return consoleError.mock.calls
    .flat()
    .some((arg) => String(arg).includes("Not implemented: navigation"));
}

/** 서버가 준 실패. `status` 로만 갈리므로 그것만 채운다. */
function apiError(status: number) {
  return Object.assign(new Error(`logout failed: ${status}`), { status });
}

/** 관리자가 추가한 코드. `termsContentHref` 가 모르므로 정적 링크가 없다. */
const refundPolicy: MyTermsConsent = {
  code: "refund-policy",
  title: "환불 정책 동의",
  required: true,
  status: "NOT_AGREED",
  latestVersion: 1,
};

const tos: MyTermsConsent = {
  code: "tos",
  title: "서비스 이용약관",
  required: true,
  status: "NEEDS_RECONSENT",
  agreedVersion: 1,
  latestVersion: 2,
};

/** 정적 링크가 없는 **선택** 약관. 동의할 필요가 없는데도 제출을 막던 자리다. */
const newsletter: MyTermsConsent = {
  code: "newsletter-policy",
  title: "뉴스레터 수신 동의",
  required: false,
  status: "NOT_AGREED",
  latestVersion: 1,
};

function renderDialog(consents: MyTermsConsent[]) {
  return render(
    <TermsReconsentDialog
      consents={consents}
      onDone={jest.fn()}
      contentHref={termsContentHref}
    />,
  );
}

describe("TermsReconsentDialog", () => {
  it("정적 링크가 없는 약관은 서버가 준 전문을 그 자리에서 펼친다", async () => {
    mockFetchActive.mockResolvedValue([
      {
        code: "refund-policy",
        title: "환불 정책 동의",
        required: true,
        version: 1,
        content: "환불은 결제일로부터 7일 이내에 가능합니다.",
      },
    ]);

    renderDialog([refundPolicy]);

    expect(await screen.findByText("전문 보기")).toBeInTheDocument();
    expect(
      screen.getByText("환불은 결제일로부터 7일 이내에 가능합니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeEnabled();
  });

  it("본문을 못 받으면 동의를 받지 않고, 다시 시도로 푼다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([refundPolicy]);

    expect(
      await screen.findByText("약관 본문을 불러오지 못했어요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();

    // 제목만 보고 한 동의가 장부에 남으면 안 된다.
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));
    expect(mockSubmit).not.toHaveBeenCalled();

    mockFetchActive.mockResolvedValueOnce([
      {
        code: "refund-policy",
        title: "환불 정책 동의",
        required: true,
        version: 1,
        content: "환불은 결제일로부터 7일 이내에 가능합니다.",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "약관 본문 다시 불러오기" }));

    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    expect(screen.getByText("전문 보기")).toBeInTheDocument();
  });

  // 포커스를 쥔 요소가 disabled 로 바뀌면 브라우저가 포커스를 body 로 내려놓는다.
  // jsdom 은 그 규칙을 구현하지 않으므로 "제출 중에도 disabled 가 아니다"로 못 박는다.
  it("저장 중에도 제출 버튼이 포커스를 잃지 않는다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSubmit.mockRejectedValueOnce(new Error("network"));

    renderDialog([tos]);

    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);

    const submit = screen.getByRole("button", { name: "동의하고 계속하기" });
    submit.focus();
    fireEvent.click(submit);

    expect(submit).toHaveTextContent("저장 중…");
    expect(submit).not.toBeDisabled();
    expect(document.activeElement).toBe(submit);

    // 실패는 다이얼로그 안에 있는 스크린리더 사용자에게도 읽혀야 한다.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("동의를 저장하지 못했어요.");
    expect(document.activeElement).toBe(submit);
    consoleError.mockRestore();
  });

  it("포커스가 모달 밖으로 떨어져도 Tab 이 안으로 되돌린다", async () => {
    renderDialog([tos]);

    const checkbox = await screen.findByRole("checkbox");
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(checkbox);

    (document.activeElement as HTMLElement).blur();
    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(shiftTab);

    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "동의하지 않고 로그아웃" }),
    );
  });

  // 약관 수만큼 길어지는 화면이다. jsdom 은 잘림을 계산하지 않아 클래스로 고정한다.
  it("약관이 많아도 패널 안에서 스크롤한다", async () => {
    const many: MyTermsConsent[] = Array.from({ length: 6 }, (_, index) => ({
      code: `terms-${index}`,
      title: `약관 ${index}`,
      required: false,
      status: "NOT_AGREED",
      latestVersion: 1,
    }));

    renderDialog([tos, ...many]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("max-h-full", "overflow-y-auto");
  });

  // 닫을 수 없는 화면의 유일한 출구다. 실패를 삼키고 이동하면 인증 쿠키가 남은 채
  // /login 으로 가고, 세션 검사가 사용자를 이 화면으로 되돌려 출구가 사라진다.
  it("로그아웃이 실패하면 나가지 않고 안내를 남긴다 — 다시 시도로 나간다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDelete.mockRejectedValueOnce(apiError(502));

    renderDialog([tos]);
    await screen.findByRole("checkbox");

    const logout = screen.getByRole("button", { name: "동의하지 않고 로그아웃" });
    fireEvent.click(logout);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("로그아웃하지 못했어요.");
    expect(didNavigate(consoleError)).toBe(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 자리를 지켰으니 그대로 다시 누른다.
    expect(logout).toHaveTextContent("동의하지 않고 로그아웃");
    fireEvent.click(logout);

    await waitFor(() => expect(didNavigate(consoleError)).toBe(true));
    expect(mockDelete).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  // 제출 버튼과 같은 규칙이다 — 누른 버튼이 disabled 로 바뀌면 브라우저가 포커스를 body 로
  // 내려놓고, 그 사용자는 방금 뜬 실패 안내를 읽지 못한다.
  it("로그아웃 중에도 버튼이 포커스를 잃지 않는다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDelete.mockRejectedValueOnce(apiError(502));

    renderDialog([tos]);
    await screen.findByRole("checkbox");

    const logout = screen.getByRole("button", { name: "동의하지 않고 로그아웃" });
    logout.focus();
    fireEvent.click(logout);

    expect(logout).toHaveTextContent("로그아웃 중…");
    expect(logout).not.toBeDisabled();
    expect(document.activeElement).toBe(logout);

    await screen.findByRole("alert");
    expect(document.activeElement).toBe(logout);
    consoleError.mockRestore();
  });

  // 반대쪽 함정. 401 은 서버가 이 토큰을 모른다는 뜻이라 세션 검사도 같은 답을 준다.
  // 여기서 붙잡으면 이미 끊긴 세션 때문에 닫을 수 없는 화면에 영영 갇힌다.
  it("이미 끊긴 세션(401)은 붙잡지 않고 로그인 화면으로 보낸다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockDelete.mockRejectedValueOnce(apiError(401));

    renderDialog([tos]);
    await screen.findByRole("checkbox");

    fireEvent.click(screen.getByRole("button", { name: "동의하지 않고 로그아웃" }));

    await waitFor(() => expect(didNavigate(consoleError)).toBe(true));
    expect(screen.queryByRole("alert")).toBeNull();
    consoleError.mockRestore();
  });

  /**
   * 닫을 수 없는 화면에서 **동의할 필요도 없는 항목**이 출구를 막으면 안 된다.
   *
   * 정적 링크가 없는 선택 약관이 섞여 있고 본문 조회가 실패하면, 읽을 수 있는 필수 약관에
   * 전부 동의해도 제출이 영영 잠겼다. 남는 길은 로그아웃뿐이었다.
   */
  it("읽을 수 없는 선택 약관은 필수 재동의를 막지 않는다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([tos, newsletter]);

    // 본문을 못 읽는 상황이 맞는지 먼저 못 박는다.
    expect(
      await screen.findByText("약관 본문을 불러오지 못했어요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /뉴스레터/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));

    // 제출은 열리되, 사용자가 건드리지 않은 항목은 페이로드에 넣지 않는다.
    // 보내지 않은 코드는 서버가 건드리지 않는다(실측 2026-09-02).
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith([{ code: "tos", agreed: true }]),
    );
  });

  /**
   * 반대 방향의 사고. 제출을 열어 준 대가로 **사용자가 고르지 않은 철회**가 기록되면 안 된다.
   *
   * 선택 약관이 `NEEDS_RECONSENT`(예전 버전에 동의함)이면 초기 체크는 비어 있다.
   * 그 빈 값을 `agreed: false` 로 보내면 서버는 예전 동의를 지운다 — 실측으로
   * `NEEDS_RECONSENT`(agreedVersion 1)가 `NOT_AGREED` 로 떨어졌다(2026-09-02).
   * 체크박스는 비활성이라 사용자는 되돌릴 수도 없다. 동의는 법적 기록이다.
   */
  it("읽을 수 없는 선택 약관의 재동의 대기 상태를 철회로 보내지 않는다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([
      tos,
      {
        ...newsletter,
        status: "NEEDS_RECONSENT",
        agreedVersion: 1,
        latestVersion: 2,
      },
    ]);

    const newsBox = await screen.findByRole("checkbox", { name: /뉴스레터/ });
    // 비어 있고, 사용자가 손댈 수도 없는 칸이다.
    expect(newsBox).not.toBeChecked();
    expect(newsBox).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit).toHaveBeenCalledWith([{ code: "tos", agreed: true }]);
  });

  /**
   * 제출을 열었다고 읽지 못한 본문에 동의가 기록되면 안 된다.
   *
   * 체크가 살아 있는 것은 예전에 받아 둔 동의다. `agreed: true` 로 다시 보내면 사용자가
   * 읽지 못한 최신 버전에 대한 동의로 갱신된다 — 페이로드에서 빼고 서버 값을 그대로 둔다.
   */
  it("읽을 수 없는 선택 약관의 기존 동의는 다시 보내지 않는다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([tos, { ...newsletter, status: "AGREED", agreedVersion: 1 }]);

    const newsBox = await screen.findByRole("checkbox", { name: /뉴스레터/ });
    expect(newsBox).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith([{ code: "tos", agreed: true }]),
    );
  });

  // 설정 패널과 같은 규칙이다 — 막는 것은 주는 방향뿐이다. 이미 준 동의를 거두는 길은
  // 본문과 무관하게 열려 있어야 한다(정보통신망법 §50).
  it("읽을 수 없어도 이미 한 선택 동의는 거둘 수 있다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([tos, { ...newsletter, status: "AGREED", agreedVersion: 1 }]);

    const newsBox = await screen.findByRole("checkbox", { name: /뉴스레터/ });
    await waitFor(() => expect(newsBox).toBeEnabled());

    fireEvent.click(newsBox);
    expect(newsBox).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관/ }));
    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith([
        { code: "tos", agreed: true },
        { code: "newsletter-policy", agreed: false },
      ]),
    );
    // 거둔 뒤에는 다시 줄 수 없다. 새 동의는 여전히 막혀 있다.
    expect(newsBox).toBeDisabled();
  });

  // 반대쪽. 필수 약관을 못 읽는 것은 그대로 막는다 — 읽지 못한 본문에 동의시키느니
  // 로그아웃으로 내보내는 것이 맞다.
  it("읽을 수 없는 필수 약관은 여전히 제출을 막는다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    renderDialog([tos, refundPolicy]);

    const tosBox = await screen.findByRole("checkbox", {
      name: /서비스 이용약관/,
    });
    fireEvent.click(tosBox);
    expect(tosBox).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /환불 정책/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});

