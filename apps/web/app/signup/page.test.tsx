/**
 * 가입 화면이 고른 동의를 언제 보관하는지.
 *
 * 보관은 **가입이 성공한 뒤에만** 해야 한다. 요청보다 앞서 남기면 가입이 깨졌을 때
 * 선택만 기기에 남고, 다음에 이 기기에서 로그인한 다른 계정의 법적 이력으로 붙는다.
 * 동의 이력은 수정·삭제되지 않아 되돌릴 방법이 없어서, 화면으로는 드러나지 않는 이
 * 순서를 테스트로 못 박는다.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import SignupPage from "@/app/signup/page";
import type { ActiveTermsState } from "@/hooks/useActiveTerms";

const mockPush = jest.fn();
const mockSignupWithEmail = jest.fn();
const mockSetPending = jest.fn();
const mockReset = jest.fn();

const SIGNUP_EMAIL = "signup@example.com";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// 세션 조회는 이 테스트의 관심사가 아니다.
jest.mock("@/hooks/useRedirectIfAuthenticated", () => ({
  useRedirectIfAuthenticated: () => {},
}));

// 브랜드 패널은 캔버스(FramePreview)를 그린다. 폼만 필요하다.
jest.mock("@/components/auth/AuthPageShell", () => ({
  AuthPageShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

jest.mock("@/components/auth/SocialLoginSection", () => ({
  SocialLoginSection: () => <div data-testid="social-login" />,
}));

let mockActiveTerms: ActiveTermsState;
jest.mock("@/hooks/useActiveTerms", () => ({
  useActiveTerms: () => mockActiveTerms,
}));

jest.mock("@/lib/auth/authApi", () => ({
  signupWithEmail: (...args: unknown[]) => mockSignupWithEmail(...args),
  sendEmailAuthCode: jest.fn(),
  verifyEmailAuthCode: jest.fn(),
}));

jest.mock("@/lib/pendingTermsConsent", () => ({
  setPendingTermsConsent: (...args: unknown[]) => mockSetPending(...args),
}));

// 인증 코드 왕복은 이 테스트의 관심사가 아니다. "인증을 마친 상태"에서 출발한다.
jest.mock("./_hooks/useEmailVerification", () => ({
  VERIFICATION_EXPIRED_MESSAGE:
    "인증 유효시간이 지났어요. 인증을 다시 받아 주세요.",
  useEmailVerification: () => ({
    verifiedEmail: SIGNUP_EMAIL,
    verifiedExpiresAt: null,
    isEmailVerified: true,
    emailCode: "",
    setEmailCode: jest.fn(),
    codeExpiresAt: null,
    isSendingCode: false,
    isVerifyingCode: false,
    emailError: null,
    codeError: null,
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
    handleEmailChange: jest.fn(),
    reset: mockReset,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveTerms = {
    items: [
      {
        code: "tos",
        title: "서비스 이용약관 동의",
        required: true,
        href: "/terms",
        content: null,
      },
      {
        code: "marketing",
        title: "마케팅 정보 수신 동의",
        required: false,
        href: "/privacy",
        content: null,
      },
    ],
    fromServer: true,
    loading: false,
  };
  mockSignupWithEmail.mockResolvedValue(undefined);
});

/** 가입 버튼을 누를 수 있는 상태까지 폼을 채운다. 선택 약관은 체크하지 않는다. */
function fillForm() {
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: SIGNUP_EMAIL },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: "harucut1234" },
  });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), {
    target: { value: "harucut1234" },
  });
  fireEvent.change(screen.getByLabelText("닉네임"), {
    target: { value: "하루컷" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /서비스 이용약관 동의/ }));
}

describe("SignupPage 약관 동의 보관", () => {
  it("가입에 성공하면 고른 동의를 가입 이메일과 함께 보관한다", async () => {
    render(<SignupPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockSetPending).toHaveBeenCalledWith(
      [
        { code: "tos", agreed: true },
        { code: "marketing", agreed: false },
      ],
      SIGNUP_EMAIL,
    );
  });

  // 여기서 보관하면 실패한 가입의 선택이 다음 로그인 계정에 붙는다.
  it("가입 요청이 실패하면 아무것도 보관하지 않는다", async () => {
    mockSignupWithEmail.mockRejectedValueOnce(
      Object.assign(new Error("already"), { code: "AUTH-030" }),
    );
    jest.spyOn(console, "error").mockImplementation(() => {});

    render(<SignupPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(mockSignupWithEmail).toHaveBeenCalled());
    expect(mockSetPending).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // 서버에 없는 코드는 보내 봐야 TERMS-001 이라 애초에 보관하지 않는다.
  it("서버가 준 약관 목록이 아니면 보관하지 않는다", async () => {
    mockActiveTerms = { ...mockActiveTerms, fromServer: false };

    render(<SignupPage />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "회원가입" }));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockSetPending).not.toHaveBeenCalled();
  });
});
