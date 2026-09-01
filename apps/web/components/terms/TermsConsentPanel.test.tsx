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
});
