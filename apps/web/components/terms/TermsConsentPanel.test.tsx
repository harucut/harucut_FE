/**
 * 마이페이지 동의 설정. 여기 체크박스는 누르는 즉시 서버 장부에 기록된다.
 *
 * 그래서 "읽을 수단이 있는가"를 못 박는다 — 관리자가 tos·privacy·marketing 밖의 코드로
 * 약관을 추가하면 정적 링크가 없어, 본문을 못 받은 사이에는 제목만 보고 한 동의가 남는다.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TermsConsentPanel } from "@/components/terms/TermsConsentPanel";
import type { MyTermsConsent } from "@/lib/termsApi";

const mockFetchMine = jest.fn();
const mockFetchActive = jest.fn();
const mockSubmit = jest.fn();

jest.mock("@/lib/termsApi", () => {
  const actual = jest.requireActual("@/lib/termsApi");
  return {
    ...actual,
    fetchMyTermsConsents: (...args: unknown[]) => mockFetchMine(...args),
    fetchActiveTerms: (...args: unknown[]) => mockFetchActive(...args),
    submitTermsConsents: (...args: unknown[]) => mockSubmit(...args),
  };
});

/** 관리자가 추가한 코드. `termsContentHref` 가 모르므로 정적 링크가 없다. */
const refundPolicy: MyTermsConsent = {
  code: "refund-policy",
  title: "환불 정책 동의",
  required: false,
  status: "NOT_AGREED",
  latestVersion: 1,
};

/** 관리자가 추가한 두 번째 선택 약관. 동시 진행을 만들려면 선택 항목이 둘 필요하다. */
const newsletterPolicy: MyTermsConsent = {
  code: "newsletter-policy",
  title: "뉴스레터 수신 동의",
  required: false,
  status: "NOT_AGREED",
  latestVersion: 1,
};

/** 둘 다 본문이 있어 체크박스가 열려 있는 상태. 잠금만 남겨 두고 본다. */
const bothReadable = [
  {
    code: "refund-policy",
    title: "환불 정책 동의",
    required: false,
    version: 1,
    content: "환불은 결제일로부터 7일 이내에 가능합니다.",
  },
  {
    code: "newsletter-policy",
    title: "뉴스레터 수신 동의",
    required: false,
    version: 1,
    content: "매주 목요일에 소식을 보냅니다.",
  },
];

/** 응답 도착 시점을 테스트가 쥔다. 느린 첫 요청을 흉내내려면 필요하다. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchMine.mockResolvedValue([refundPolicy]);
  mockFetchActive.mockResolvedValue([]);
  mockSubmit.mockResolvedValue(undefined);
});

describe("TermsConsentPanel", () => {
  it("본문을 못 받은 새 선택 약관은 동의를 받지 않는다", async () => {
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentPanel />);

    const checkbox = await screen.findByRole("checkbox");
    await waitFor(() => expect(checkbox).toBeDisabled());
    expect(
      screen.getByText("약관 본문을 불러오지 못했어요. 잠시 후 새로고침해 주세요."),
    ).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("본문을 받으면 전문과 함께 동의를 받는다", async () => {
    mockFetchActive.mockResolvedValue([
      {
        code: "refund-policy",
        title: "환불 정책 동의",
        required: false,
        version: 1,
        content: "환불은 결제일로부터 7일 이내에 가능합니다.",
      },
    ]);

    render(<TermsConsentPanel />);

    expect(await screen.findByText("전문 보기")).toBeInTheDocument();
    expect(
      screen.getByText("환불은 결제일로부터 7일 이내에 가능합니다."),
    ).toBeInTheDocument();

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith([
        { code: "refund-policy", agreed: true },
      ]),
    );
  });

  // 우리 약관 화면이 있는 코드는 본문 조회와 무관하게 읽을 수 있다.
  it("정적 링크가 있는 약관은 본문 조회 실패와 무관하다", async () => {
    mockFetchMine.mockResolvedValue([
      {
        code: "marketing",
        title: "마케팅 정보 수신 동의",
        required: false,
        status: "NOT_AGREED",
        latestVersion: 1,
      },
    ]);
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentPanel />);

    const checkbox = await screen.findByRole("checkbox");
    await waitFor(() => expect(mockFetchActive).toHaveBeenCalled());
    expect(checkbox).toBeEnabled();
    expect(screen.getByRole("link", { name: "보기" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  /**
   * 이미 한 동의를 거두는 길은 본문과 무관하다.
   *
   * 마케팅 수신 동의는 언제든 거둘 수 있어야 한다(정보통신망법 §50). 본문 조회가
   * 실패했다고 철회까지 잠그면 사용자는 자기가 준 동의에 갇힌다 — 읽을 수단이 없다는
   * 이유로 막을 것은 **새 동의**뿐이다.
   */
  it("본문 조회가 실패해도 이미 동의한 선택 약관은 체크박스가 열려 있다", async () => {
    mockFetchMine.mockResolvedValue([
      { ...refundPolicy, status: "AGREED", agreedVersion: 1 },
    ]);
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentPanel />);

    const checkbox = await screen.findByRole("checkbox");
    // 본문을 못 읽는 상황이 맞는지 먼저 못 박는다.
    expect(
      await screen.findByText(
        "약관 본문을 불러오지 못했어요. 잠시 후 새로고침해 주세요.",
      ),
    ).toBeInTheDocument();

    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
  });

  /**
   * 잠금과 제출은 같은 규칙을 따라야 한다.
   *
   * 체크박스만 열고 `toggle()` 가드를 그대로 두면 눌리는데 요청이 안 나간다 — 잠긴 것보다
   * 헷갈리는 무반응이다. 두 자리 모두 주는 방향만 막는다.
   */
  it(
    "본문 조회가 실패해도 이미 동의한 선택 약관을 해제하면 철회가 제출된다",
    async () => {
      mockFetchMine.mockResolvedValue([
        { ...refundPolicy, status: "AGREED", agreedVersion: 1 },
      ]);
      mockFetchActive.mockRejectedValueOnce(new Error("network"));

      render(<TermsConsentPanel />);

      const checkbox = await screen.findByRole("checkbox");
      await waitFor(() => expect(checkbox).toBeEnabled());

      fireEvent.click(checkbox);

      await waitFor(() =>
        expect(mockSubmit).toHaveBeenCalledWith([
          { code: "refund-policy", agreed: false },
        ]),
      );
      expect(checkbox).not.toBeChecked();
    },
  );

  // 같은 화면·같은 실패에서 방향만 다르다. 새 동의는 그대로 막혀 있어야 한다.
  it("같은 실패에서 아직 동의하지 않은 선택 약관은 여전히 막혀 있다", async () => {
    mockFetchMine.mockResolvedValue([
      { ...refundPolicy, status: "AGREED", agreedVersion: 1 },
      {
        ...refundPolicy,
        code: "newsletter-policy",
        title: "뉴스레터 수신 동의",
        status: "NOT_AGREED",
      },
    ]);
    mockFetchActive.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentPanel />);

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    const [agreedBox, notAgreedBox] = screen.getAllByRole("checkbox");

    // 이미 한 동의는 열려 있고, 아직 안 한 동의는 잠겨 있다.
    await waitFor(() => expect(agreedBox).toBeEnabled());
    expect(notAgreedBox).toBeDisabled();

    fireEvent.click(notAgreedBox);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  /**
   * 잠금은 항목마다 따로 있어야 한다.
   *
   * 잠금이 코드 하나였을 때는 두 번째 항목을 누르는 순간 첫 항목이 다시 열렸다. 그
   * 상태에서 첫 항목을 한 번 더 누르면 같은 약관에 동의와 철회가 나란히 날아가, 서버
   * 장부가 화면의 마지막 선택과 반대로 굳을 수 있었다.
   */
  it("선택 약관 둘이 동시에 나가도 각 항목의 잠금은 따로 유지된다", async () => {
    mockFetchMine.mockResolvedValue([refundPolicy, newsletterPolicy]);
    mockFetchActive.mockResolvedValue(bothReadable);

    const first = deferred();
    const second = deferred();
    mockSubmit
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<TermsConsentPanel />);

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(2),
    );
    const [refundBox, newsletterBox] = screen.getAllByRole("checkbox");
    await waitFor(() => expect(refundBox).toBeEnabled());

    fireEvent.click(refundBox);
    expect(refundBox).toBeDisabled();

    fireEvent.click(newsletterBox);
    // 두 번째 클릭이 첫 항목의 잠금을 덮지 않는다.
    expect(refundBox).toBeDisabled();
    expect(newsletterBox).toBeDisabled();

    expect(mockSubmit).toHaveBeenNthCalledWith(1, [
      { code: "refund-policy", agreed: true },
    ]);
    expect(mockSubmit).toHaveBeenNthCalledWith(2, [
      { code: "newsletter-policy", agreed: true },
    ]);

    await act(async () => {
      first.resolve();
      second.resolve();
    });
    expect(refundBox).toBeEnabled();
    expect(newsletterBox).toBeEnabled();
    expect(mockSubmit).toHaveBeenCalledTimes(2);
  });

  // 한 요청의 완료가 남의 잠금을 풀면, 그 사이에 눌린 클릭이 중복 요청이 된다.
  it("먼저 끝난 요청이 아직 나가 있는 항목의 잠금을 풀지 않는다", async () => {
    mockFetchMine.mockResolvedValue([refundPolicy, newsletterPolicy]);
    mockFetchActive.mockResolvedValue(bothReadable);

    const first = deferred();
    const second = deferred();
    mockSubmit
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<TermsConsentPanel />);

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(2),
    );
    const [refundBox, newsletterBox] = screen.getAllByRole("checkbox");
    await waitFor(() => expect(refundBox).toBeEnabled());

    fireEvent.click(refundBox);
    fireEvent.click(newsletterBox);

    // 나중에 나간 요청이 먼저 끝난다.
    await act(async () => {
      second.resolve();
    });
    expect(newsletterBox).toBeEnabled();
    expect(refundBox).toBeDisabled();

    await act(async () => {
      first.resolve();
    });
    expect(refundBox).toBeEnabled();
    expect(mockSubmit).toHaveBeenCalledTimes(2);
  });

  // 실패는 자기 항목만 되돌린다. 남의 화면까지 서버 값으로 덮으면, 그 요청이 성공한 뒤에도
  // 화면은 꺼진 채로 남아 장부와 어긋난다.
  it("한 항목의 실패가 아직 나가 있는 다른 항목의 화면을 되돌리지 않는다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockFetchMine.mockResolvedValue([refundPolicy, newsletterPolicy]);
    mockFetchActive.mockResolvedValue(bothReadable);

    const first = deferred();
    const second = deferred();
    mockSubmit
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    render(<TermsConsentPanel />);

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(2),
    );
    const [refundBox, newsletterBox] = screen.getAllByRole("checkbox");
    await waitFor(() => expect(refundBox).toBeEnabled());

    fireEvent.click(refundBox);
    fireEvent.click(newsletterBox);
    expect(refundBox).toBeChecked();
    expect(newsletterBox).toBeChecked();

    await act(async () => {
      first.reject(new Error("network"));
    });

    // 실패한 항목만 서버 값으로 돌아간다.
    expect(refundBox).not.toBeChecked();
    expect(refundBox).toBeEnabled();
    // 아직 나가 있는 항목은 화면도 잠금도 그대로다.
    expect(newsletterBox).toBeChecked();
    expect(newsletterBox).toBeDisabled();

    await act(async () => {
      second.resolve();
    });
    expect(newsletterBox).toBeChecked();
    expect(newsletterBox).toBeEnabled();
    consoleError.mockRestore();
  });

  /**
   * 변경 실패 뒤의 재조회 실패는 최초 조회 실패와 다르다.
   *
   * 장애가 이어져 재조회까지 실패했다고 목록을 비우면 체크박스가 전부 사라진다 —
   * 연결이 돌아와도 같은 화면에서 재시도할 자리가 없고, 사용자에게 실제로 필요한
   * 저장 실패 문구도 일반 조회 오류로 덮인다.
   */
  it("변경 실패 뒤 재조회까지 실패해도 목록과 저장 오류가 남는다", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    // 첫 조회만 성공한다. 실패 뒤의 재조회는 장애가 이어지는 상황이라 실패한다.
    mockFetchMine
      .mockResolvedValueOnce([refundPolicy, newsletterPolicy])
      .mockRejectedValue(new Error("network"));
    mockFetchActive.mockResolvedValue(bothReadable);
    mockSubmit.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentPanel />);

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")).toHaveLength(2),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")[0]).toBeEnabled(),
    );

    fireEvent.click(screen.getAllByRole("checkbox")[0]);

    // 저장 실패 문구가 남는다. 재조회 실패가 조회 오류로 덮어쓰지 않는다.
    expect(
      await screen.findByText("동의 설정을 저장하지 못했어요."),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockFetchMine).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText("약관 동의 정보를 불러오지 못했어요."),
    ).not.toBeInTheDocument();

    // 목록은 그대로 있고, 실패한 항목은 눌리기 전 값으로 돌아가 있다.
    const [refundBox, newsletterBox] = screen.getAllByRole("checkbox");
    expect(refundBox).not.toBeChecked();
    expect(refundBox).toBeEnabled();
    expect(newsletterBox).toBeEnabled();

    // 연결이 회복되면 같은 화면에서 같은 방향으로 다시 시도할 수 있다.
    mockSubmit.mockResolvedValueOnce(undefined);
    fireEvent.click(refundBox);

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
    expect(mockSubmit).toHaveBeenNthCalledWith(2, [
      { code: "refund-policy", agreed: true },
    ]);
    expect(refundBox).toBeChecked();
    consoleError.mockRestore();
  });

  // 반대쪽 경계. 보여 줄 것이 없는 최초 조회 실패는 지금처럼 조회 오류만 남긴다.
  it("최초 조회가 실패하면 빈 화면과 조회 오류를 보여 준다", async () => {
    mockFetchMine.mockRejectedValue(new Error("network"));

    render(<TermsConsentPanel />);

    expect(
      await screen.findByText("약관 동의 정보를 불러오지 못했어요."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
