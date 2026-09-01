/**
 * 마이페이지 동의 설정. 여기 체크박스는 누르는 즉시 서버 장부에 기록된다.
 *
 * 그래서 "읽을 수단이 있는가"를 못 박는다 — 관리자가 tos·privacy·marketing 밖의 코드로
 * 약관을 추가하면 정적 링크가 없어, 본문을 못 받은 사이에는 제목만 보고 한 동의가 남는다.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
