/**
 * 로그인 뒤 동의를 기록하고, 필수 약관이 비어 있으면 붙잡는 쪽.
 *
 * 여기가 조용히 안 돌면 증상이 없다 — 화면은 멀쩡하고 서버 장부만 비어 있다.
 * 그래서 "돌았는지"를 테스트로 못 박는다.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { TermsConsentBridge } from "@/components/terms/TermsConsentBridge";

const mockSubmit = jest.fn();
const mockFetchMine = jest.fn();
const mockGetPending = jest.fn();
const mockClearPending = jest.fn();

let mockPathname = "/home";

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("@/lib/termsApi", () => {
  const actual = jest.requireActual("@/lib/termsApi");
  return {
    ...actual,
    fetchMyTermsConsents: (...args: unknown[]) => mockFetchMine(...args),
    submitTermsConsents: (...args: unknown[]) => mockSubmit(...args),
  };
});

jest.mock("@/lib/pendingTermsConsent", () => ({
  getPendingTermsConsent: (...args: unknown[]) => mockGetPending(...args),
  clearPendingTermsConsent: (...args: unknown[]) => mockClearPending(...args),
}));

function setSession(authenticated: boolean) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ authenticated }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/home";
  setSession(true);
  mockGetPending.mockReturnValue(null);
  mockFetchMine.mockResolvedValue([]);
  mockSubmit.mockResolvedValue(undefined);
});

describe("TermsConsentBridge", () => {
  it("가입 때 고른 동의를 로그인 뒤 서버에 기록한다", async () => {
    mockGetPending.mockReturnValue([
      { code: "tos", agreed: true },
      { code: "marketing", agreed: false },
    ]);

    render(<TermsConsentBridge />);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith([
        { code: "tos", agreed: true },
        { code: "marketing", agreed: false },
      ]);
    });
    expect(mockClearPending).toHaveBeenCalled();
  });

  // 로그인할 때마다 같은 요청이 나가고 매번 같은 이유로 실패하는 것을 막는다.
  it("다시 보내도 소용없는 실패면 보관물을 버린다", async () => {
    mockGetPending.mockReturnValue([{ code: "gone", agreed: true }]);
    mockSubmit.mockRejectedValueOnce(
      Object.assign(new Error("nope"), { code: "TERMS-001" }),
    );

    render(<TermsConsentBridge />);

    await waitFor(() => {
      expect(mockClearPending).toHaveBeenCalled();
    });
  });

  it("네트워크 실패면 보관물을 남긴다", async () => {
    mockGetPending.mockReturnValue([{ code: "tos", agreed: true }]);
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
    mockGetPending.mockReturnValue([{ code: "tos", agreed: true }]);

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockSubmit).not.toHaveBeenCalled());
    expect(mockFetchMine).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 아무것도 하지 않는다", async () => {
    setSession(false);
    mockGetPending.mockReturnValue([{ code: "tos", agreed: true }]);

    render(<TermsConsentBridge />);

    await waitFor(() => expect(mockSubmit).not.toHaveBeenCalled());
    expect(mockFetchMine).not.toHaveBeenCalled();
  });
});
