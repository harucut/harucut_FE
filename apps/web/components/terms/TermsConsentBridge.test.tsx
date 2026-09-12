/**
 * 로그인 뒤 동의를 기록하고, 필수 약관이 비어 있으면 붙잡는 쪽.
 *
 * 여기가 조용히 안 돌면 증상이 없다 — 화면은 멀쩡하고 서버 장부만 비어 있다.
 * 반대로 아무 계정에나 보내도 증상이 없다 — 남의 장부가 조용히 더럽혀진다.
 * 둘 다 테스트로 못 박는다.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TermsConsentBridge } from "@/components/terms/TermsConsentBridge";
import type { ActiveTerms } from "@/lib/termsApi";

const mockSubmit = jest.fn();
const mockFetchMine = jest.fn();
const mockFetchActive = jest.fn();
const mockGetPending = jest.fn();
const mockClearPending = jest.fn();
const mockGetMyUserInfo = jest.fn();

const SIGNUP_EMAIL = "signup@example.com";
/** 이 기기에서 **나중에** 가입한 다른 사람. 아래 "다른 탭" 갈래에서 쓴다. */
const OTHER_EMAIL = "newcomer@example.com";

let mockPathname = "/home";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/termsApi", () => {
  const actual = jest.requireActual("@/lib/termsApi");
  return {
    ...actual,
    fetchMyTermsConsents: (...args: unknown[]) => mockFetchMine(...args),
    // 재동의 화면은 서버 본문으로만 읽힌다(정적 대역 없음). 이걸 안 막으면 실제 조회가
    // 나가 실패하고, 체크박스가 잠겨 화면을 통과시킬 수 없다.
    fetchActiveTerms: (...args: unknown[]) => mockFetchActive(...args),
    submitTermsConsents: (...args: unknown[]) => mockSubmit(...args),
  };
});

// 계정 대조(`isSameConsentAccount`)는 진짜를 쓴다 — 대조 규칙까지 목킹하면
// "다른 계정이면 안 보낸다"를 검증하는 뜻이 없어진다.
jest.mock("@/lib/pendingTermsConsent", () => {
  const actual = jest.requireActual("@/lib/pendingTermsConsent");
  return {
    ...actual,
    getPendingTermsConsent: (...args: unknown[]) => mockGetPending(...args),
    clearPendingTermsConsentIfUnchanged: (...args: unknown[]) =>
      mockClearPending(...args),
  };
});

const mockResolveMembership = jest.fn();

jest.mock("@/lib/authSession", () => ({
  resolveMembership: (...args: unknown[]) => mockResolveMembership(...args),
}));

jest.mock("@/lib/userApi", () => ({
  getMyUserInfo: (...args: unknown[]) => mockGetMyUserInfo(...args),
}));

/**
 * 보관소의 진짜 구현. 아래 재동의 갈래는 **localStorage 에 실제로 무엇이 남는가**를
 * 못 박는다 — 지우기까지 가짜로 두면 "다른 탭 사람의 보관물을 지웠는지"가 보이지 않는다.
 * 그래서 `mockClearPending` 도 호출만 세고 실제 삭제는 진짜에게 넘긴다(아래 beforeEach).
 */
const realPending = jest.requireActual<typeof import("@/lib/pendingTermsConsent")>(
  "@/lib/pendingTermsConsent",
);

/** 재동의 화면이 그 자리에 펼치는 서버 본문. 이게 없으면 어떤 칸도 체크할 수 없다. */
const ACTIVE_TERMS: ActiveTerms[] = [
  {
    code: "tos",
    title: "서비스 이용약관",
    required: true,
    version: 1,
    content: "제1조 이용약관 본문입니다.",
  },
  {
    code: "marketing",
    title: "마케팅 수신 동의",
    required: false,
    version: 1,
    content: "마케팅 수신 동의 본문입니다.",
  },
];

/**
 * 로그인 여부는 **`resolveMembership()`** 이 정한다.
 *
 * 생 `/api/auth/session` 이 아닌 이유: 그 라우트는 만료된 access 를 재발급해 주지 않고
 * 백엔드의 401 을 `authenticated: false` 로 감싼다. 그러면 refresh 가 멀쩡한 회원이
 * 비회원으로 읽혀 필수 약관 재동의를 통째로 건너뛴다.
 */
function setSession(membership: "member" | "guest" | "unknown") {
  mockResolveMembership.mockResolvedValue(membership);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockPathname = "/home";
  setSession("member");
  mockGetPending.mockReturnValue(null);
  mockClearPending.mockImplementation((expected: unknown) =>
    realPending.clearPendingTermsConsentIfUnchanged(
      expected as Parameters<typeof realPending.clearPendingTermsConsentIfUnchanged>[0],
    ),
  );
  mockFetchMine.mockResolvedValue([]);
  mockFetchActive.mockResolvedValue(ACTIVE_TERMS);
  mockSubmit.mockResolvedValue(undefined);
  mockGetMyUserInfo.mockResolvedValue({ email: SIGNUP_EMAIL });
});

afterEach(() => {
  jest.useRealTimers();
});

/** 가입 때 고른 값. 재동의 화면에서 고를 값과 달라야 "되돌아감"이 보인다. */
const ARCHIVED_ITEMS = [
  { code: "tos", agreed: true },
  { code: "marketing", agreed: true },
];

/**
 * 가입 때 보관물이 **남은 채로** 재동의 화면이 뜨는 상태를 만든다.
 * 내 정보 조회가 흔들리면 계정을 대조하지 못해 보관물이 그대로 남는다(위 갈래 참고).
 */
function stageReconsentWithArchive() {
  realPending.setPendingTermsConsent(ARCHIVED_ITEMS, SIGNUP_EMAIL);
  mockGetPending.mockImplementation(() => realPending.getPendingTermsConsent());
  mockGetMyUserInfo.mockRejectedValueOnce(new Error("network"));
  mockFetchMine.mockResolvedValue([
    {
      code: "tos",
      title: "서비스 이용약관",
      required: true,
      status: "NOT_AGREED",
      latestVersion: 1,
    },
    {
      code: "marketing",
      title: "마케팅 수신 동의",
      required: false,
      status: "NOT_AGREED",
      latestVersion: 1,
    },
  ]);
}

/** 필수만 체크해 화면을 통과한다. 다이얼로그가 사라지면 `onDone` 이 돈 것이다. */
async function passReconsentDialog() {
  const tosBox = screen.getByRole("checkbox", { name: /서비스 이용약관/ });
  // 본문이 도착하기 전에는 잠겨 있다 — 잠긴 칸을 눌러도 화면을 통과할 수 없다.
  await waitFor(() => expect(tosBox).toBeEnabled());
  fireEvent.click(tosBox);
  fireEvent.click(screen.getByRole("button", { name: "동의하고 계속하기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("TermsConsentBridge", () => {
  it("가입한 계정으로 로그인하면 고른 동의를 서버에 기록한다", async () => {
    mockGetPending.mockReturnValue({
      items: [
        { code: "tos", agreed: true },
        { code: "marketing", agreed: false },
      ],
      email: SIGNUP_EMAIL,
    });
    // 서버가 돌려주는 표기가 가입 폼에 친 것과 늘 같지는 않다.
    mockGetMyUserInfo.mockResolvedValue({ email: "Signup@Example.com" });

    render(<TermsConsentBridge />);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith([
        { code: "tos", agreed: true },
        { code: "marketing", agreed: false },
      ]);
    });
    expect(mockClearPending).toHaveBeenCalled();
  });

  // 동의 이력은 수정·삭제되지 않는다. 한 번 잘못 붙으면 되돌릴 방법이 없다.
  it("다른 계정으로 로그인하면 보내지 않고 보관물을 버린다", async () => {
    mockGetPending.mockReturnValue({
      items: [{ code: "marketing", agreed: true }],
      email: SIGNUP_EMAIL,
    });
    mockGetMyUserInfo.mockResolvedValue({ email: "someone-else@example.com" });

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockClearPending).toHaveBeenCalled());
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  /*
    보내는 사이에 다른 탭에서 가입이 끝나면 같은 origin 의 키가 그 사람 동의로 바뀐다.
    `submitTermsConsents` 는 네트워크 왕복이라 그 창이 수 초까지 벌어진다. 무조건 지우면
    아직 제출되지 않은 남의 법적 동의가 사라진다.
  */
  it("보내는 사이 다른 탭이 새로 넣은 보관물은 지우지 않는다", async () => {
    const mine = { items: [{ code: "tos", agreed: true }], email: SIGNUP_EMAIL };
    realPending.setPendingTermsConsent(mine.items, mine.email);
    mockGetPending.mockReturnValue(mine);
    mockGetMyUserInfo.mockResolvedValue({ email: SIGNUP_EMAIL });

    // 제출이 도는 동안 다른 탭이 새 가입 동의를 덮어쓴다.
    mockSubmit.mockImplementation(async () => {
      realPending.setPendingTermsConsent(
        [{ code: "tos", agreed: true }],
        "newcomer@example.com",
      );
    });

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockClearPending).toHaveBeenCalled());
    // 지우려 시도는 했지만 내가 읽었던 그 보관물이 아니라 살아남아야 한다.
    expect(realPending.getPendingTermsConsent()).toEqual({
      items: [{ code: "tos", agreed: true }],
      email: "newcomer@example.com",
    });
  });

  // 조회가 흔들린 것뿐이면 주인이 다시 와서 기록할 기회를 남겨 둔다.
  it("내 정보 조회가 실패하면 보내지도 지우지도 않는다", async () => {
    mockGetPending.mockReturnValue({
      items: [{ code: "tos", agreed: true }],
      email: SIGNUP_EMAIL,
    });
    mockGetMyUserInfo.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockFetchMine).toHaveBeenCalled());
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  // 로그인할 때마다 같은 요청이 나가고 매번 같은 이유로 실패하는 것을 막는다.
  it("다시 보내도 소용없는 실패면 보관물을 버린다", async () => {
    mockGetPending.mockReturnValue({
      items: [{ code: "gone", agreed: true }],
      email: SIGNUP_EMAIL,
    });
    mockSubmit.mockRejectedValueOnce(
      Object.assign(new Error("nope"), { code: "TERMS-001" }),
    );

    render(<TermsConsentBridge />);

    await waitFor(() => {
      expect(mockClearPending).toHaveBeenCalled();
    });
  });

  it("네트워크 실패면 보관물을 남긴다", async () => {
    mockGetPending.mockReturnValue({
      items: [{ code: "tos", agreed: true }],
      email: SIGNUP_EMAIL,
    });
    mockSubmit.mockRejectedValueOnce(new Error("network"));

    render(<TermsConsentBridge />);

    await waitFor(() => {
      expect(mockFetchMine).toHaveBeenCalled();
    });
    expect(mockClearPending).not.toHaveBeenCalled();
  });

  it("필수 약관에 동의가 없으면 붙잡는다", async () => {
    mockFetchMine.mockResolvedValue([
      {
        code: "tos",
        title: "서비스 이용약관",
        required: true,
        status: "NEEDS_RECONSENT",
        agreedVersion: 1,
        latestVersion: 2,
      },
    ]);

    render(<TermsConsentBridge />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("약관이 개정되었어요")).toBeInTheDocument();
  });

  /*
    보관물이 남은 채로 재동의 화면을 통과하는 갈래. 여기서 안 지우면 다음 새로고침에
    예전 보관물이 다시 제출되어, 방금 이 화면에서 고른 선택 약관 값이 가입 때 값으로
    되돌아간다 — 동의 이력은 수정·삭제되지 않는다.
  */
  it("재동의 화면을 통과하면 남아 있던 보관물을 지운다", async () => {
    stageReconsentWithArchive();

    render(<TermsConsentBridge />);

    await screen.findByRole("dialog");
    // 여기까지는 남아 있어야 한다 — 보낼지 말지는 화면을 통과한 뒤에 갈린다.
    expect(realPending.getPendingTermsConsent()).not.toBeNull();

    await passReconsentDialog();

    expect(realPending.getPendingTermsConsent()).toBeNull();
  });

  /*
    보관 키는 같은 origin 의 모든 탭이 함께 쓴다. 사용자가 이 화면에서 약관을 읽는 동안
    다른 탭에서 새 가입이 끝나면, 키에는 **그 사람의 아직 제출되지 않은 동의**가 들어와
    있다. 그것까지 지우면 고른 적 있는 법적 동의가 소리 없이 사라지는데, 동의 이력은
    나중에 만들어 넣을 수 없다.
  */
  it("재동의 중 다른 탭이 새로 넣은 보관물은 지우지 않는다", async () => {
    stageReconsentWithArchive();

    render(<TermsConsentBridge />);

    await screen.findByRole("dialog");
    // 다른 탭에서 새 가입 완료 — 같은 키가 다른 계정의 동의로 바뀐다.
    realPending.setPendingTermsConsent([{ code: "tos", agreed: true }], OTHER_EMAIL);

    await passReconsentDialog();

    expect(realPending.getPendingTermsConsent()).toEqual({
      items: [{ code: "tos", agreed: true }],
      email: OTHER_EMAIL,
    });
  });

  it("선택 약관만 비어 있으면 붙잡지 않는다", async () => {
    mockFetchMine.mockResolvedValue([
      {
        code: "marketing",
        title: "마케팅 수신 동의",
        required: false,
        status: "NOT_AGREED",
        latestVersion: 1,
      },
    ]);

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockFetchMine).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // 랜딩·약관 화면까지 막으면 "무엇에 동의하는지" 읽으러 갈 수조차 없다.
  it("보호 화면이 아니면 아무것도 하지 않는다", async () => {
    mockPathname = "/terms";
    mockGetPending.mockReturnValue({
      items: [{ code: "tos", agreed: true }],
      email: SIGNUP_EMAIL,
    });

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockSubmit).not.toHaveBeenCalled());
    expect(mockFetchMine).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 아무것도 하지 않는다", async () => {
    setSession("guest");
    mockGetPending.mockReturnValue({
      items: [{ code: "tos", agreed: true }],
      email: SIGNUP_EMAIL,
    });

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockSubmit).not.toHaveBeenCalled());
    expect(mockFetchMine).not.toHaveBeenCalled();
  });

  /*
    회귀 — **access 만 만료된 회원에게도 재동의를 묻는다.**

    생 `/api/auth/session` 은 만료된 access 를 재발급해 주지 않고 `authenticated: false` 로
    감싼다. 그것을 근거로 삼으면 refresh 가 멀쩡한 회원이 비회원으로 읽혀 필수 약관 재동의가
    통째로 건너뛰어진다 — 이 effect 는 주소가 바뀔 때만 다시 도므로, 같은 화면의 다른 API 가
    곧 토큰을 되살려도 다음 SPA 이동까지 못 받는다. 서버가 강제하지 않는 검사라 그대로 지나간다.
  */
  it("재발급을 거쳐 회원으로 확인되면 검사를 진행한다", async () => {
    setSession("member");

    render(<TermsConsentBridge />);

    // 회원으로 확인돼야 내 동의 조회까지 간다 — 여기가 재동의 판정의 입구다.
    await waitFor(() => expect(mockFetchMine).toHaveBeenCalled());
  });

  // 반대쪽 못 — 못 물어봤으면 진행하지 않는다. 서버가 흔들렸다고 재동의를 강요하지 않는다.
  it("판정할 수 없으면 검사를 진행하지 않는다", async () => {
    setSession("unknown");

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockResolveMembership).toHaveBeenCalled());
    expect(mockFetchMine).not.toHaveBeenCalled();
  });

  /*
    회귀 — **공개 화면으로 옮겨 간 사이에 온 결과로 막지 않는다.**

    검사는 보호 경로에서만 시작하지만 왕복이 둘 붙는다(회원 판정 · 약관 조회). 그 사이
    사용자가 `/terms` 로 옮겨 가면, 늦게 온 결과가 **약관 본문을 읽으러 간 사람을 그 자리에서
    막는다** — 이 파일이 세운 「읽을 수 있게 두고 보호 화면에서만 막는다」가 뒤집힌다.
  */
  /** 필수 약관이 개정돼 재동의가 필요한 상태. 위 「붙잡는다」 테스트와 같은 모양이다. */
  const NEEDS_RECONSENT = [
    {
      code: "tos",
      title: "서비스 이용약관",
      required: true,
      status: "NEEDS_RECONSENT",
      agreedVersion: 1,
      latestVersion: 2,
    },
  ];

  it("검사 중에 공개 화면으로 옮겨 가면 그 화면에서는 막지 않는다", async () => {
    mockPathname = "/home";
    let answer!: (value: unknown) => void;
    mockFetchMine.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const view = render(<TermsConsentBridge />);
    await waitFor(() => expect(mockFetchMine).toHaveBeenCalled());

    // 조회가 도는 사이 약관 본문을 읽으러 간다.
    mockPathname = "/terms";
    view.rerender(<TermsConsentBridge />);

    await act(async () => {
      answer(NEEDS_RECONSENT);
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /*
    반대쪽 못 — **결과를 버리지는 않는다.** 버리면 `checkedRef` 가 이미 서 있어 다시 묻지
    않으므로, 공개 화면을 한 번 들르는 것만으로 필수 재동의를 영영 피할 수 있다.
    보호 화면으로 돌아오면 그때 뜬다.
  */
  it("보호 화면으로 돌아오면 그때 재동의를 띄운다", async () => {
    mockPathname = "/home";
    let answer!: (value: unknown) => void;
    mockFetchMine.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const view = render(<TermsConsentBridge />);
    await waitFor(() => expect(mockFetchMine).toHaveBeenCalled());

    mockPathname = "/terms";
    view.rerender(<TermsConsentBridge />);
    await act(async () => {
      answer(NEEDS_RECONSENT);
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    mockPathname = "/home";
    view.rerender(<TermsConsentBridge />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
  it("일시적인 조회 실패는 같은 화면에서도 한 번 다시 확인한다", async () => {
    jest.useFakeTimers();
    mockFetchMine
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(NEEDS_RECONSENT);
    render(<TermsConsentBridge />);
    await act(async () => {});
    expect(mockFetchMine).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("회원 판정이 불명확했던 회차도 같은 화면에서 복구한다", async () => {
    jest.useFakeTimers();
    mockResolveMembership.mockResolvedValueOnce("unknown").mockResolvedValue("member");
    render(<TermsConsentBridge />);
    await act(async () => {});
    expect(mockFetchMine).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(1);
  });

  it("계속 실패해도 자동 반복은 한 번뿐이고 다음 보호 화면에서 다시 묻는다", async () => {
    jest.useFakeTimers();
    mockFetchMine.mockRejectedValue(new Error("network"));
    const view = render(<TermsConsentBridge />);
    await act(async () => {});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(2);
    mockFetchMine.mockResolvedValue(NEEDS_RECONSENT);
    mockPathname = "/mypage";
    view.rerender(<TermsConsentBridge />);
    await act(async () => {});
    expect(mockFetchMine).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("조회 재시도가 응답을 잃은 동의 POST를 중복 제출하지 않는다", async () => {
    jest.useFakeTimers();
    mockGetPending.mockReturnValue({ items: ARCHIVED_ITEMS, email: SIGNUP_EMAIL });
    mockSubmit.mockRejectedValueOnce(new Error("response lost"));
    mockFetchMine
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(NEEDS_RECONSENT);
    render(<TermsConsentBridge />);
    await act(async () => {});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(2);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockClearPending).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("계정 조회만 실패해 제출하지 못한 가입 동의는 재시도에서 인계한다", async () => {
    jest.useFakeTimers();
    mockGetPending.mockReturnValue({ items: ARCHIVED_ITEMS, email: SIGNUP_EMAIL });
    mockGetMyUserInfo.mockRejectedValueOnce(new Error("network"));
    mockFetchMine.mockRejectedValueOnce(new Error("network")).mockResolvedValue([]);
    render(<TermsConsentBridge />);
    await act(async () => {});
    expect(mockSubmit).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(ARCHIVED_ITEMS);
    expect(mockClearPending).toHaveBeenCalledTimes(1);
  });

  it("공개 화면에서는 재시도를 멈추고 보호 화면에 돌아오면 복구한다", async () => {
    jest.useFakeTimers();
    mockFetchMine
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(NEEDS_RECONSENT);
    const view = render(<TermsConsentBridge />);
    await act(async () => {});
    mockPathname = "/terms";
    view.rerender(<TermsConsentBridge />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(1);
    mockPathname = "/home";
    view.rerender(<TermsConsentBridge />);
    await act(async () => {});
    expect(mockFetchMine).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("화면 트리가 사라지면 예약 재시도도 정리한다", async () => {
    jest.useFakeTimers();
    mockFetchMine.mockRejectedValue(new Error("network"));
    const view = render(<TermsConsentBridge />);
    await act(async () => {});
    view.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(mockFetchMine).toHaveBeenCalledTimes(1);
  });
});
