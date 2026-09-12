/**
 * 로그인 화면이 비밀번호를 어디까지 막는가.
 *
 * 서버 `LoginRequest.password` 는 `minLength: 1` 뿐이다(실측). 예전에는 가입용
 * `validatePassword`(8~20자 + 문자 클래스)를 로그인에도 걸어서, **맞는 비밀번호인데 요청이
 * 브라우저를 떠나지 못하고** 화면은 "비밀번호가 올바르지 않다"고 말했다 — 20자를 넘거나
 * `~ " < > | / \ '` 같은 문자가 든 계정(다른 클라이언트·시드·관리자가 만든 계정)이 그랬다.
 * 화면만 봐서는 서버가 거절한 것과 구분되지 않는 회귀라 여기서 못 박는다.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import LoginPage from "@/app/login/page";

const mockLoginWithEmail = jest.fn();
const mockReactivateAccount = jest.fn();

const LOGIN_EMAIL = "login@example.com";

/** 25자 — 예전 규칙의 20자 상한을 넘는다. 서버는 받는다. */
const LONG_PASSWORD = "harucut-super-long-pass25";

/** 가입용 문자 클래스에 없는 `~` 와 `"`. 서버는 받는다. */
const SPECIAL_PASSWORD = 'haru~cut"1234';

/** 앞뒤 공백까지 비밀번호의 일부다. 이메일과 달리 잘라내면 다른 비밀번호가 된다. */
const SPACED_PASSWORD = "  harucut pass  ";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
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

jest.mock("@/lib/auth/authApi", () => ({
  loginWithEmail: (...args: unknown[]) => mockLoginWithEmail(...args),
  reactivateAccount: (...args: unknown[]) => mockReactivateAccount(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLoginWithEmail.mockResolvedValue({ userStatus: "ACTIVE" });
  /*
    로그인에 성공하면 `window.location.href` 로 이동한다. jsdom 은 실제 이동을 하지 않고
    "Not implemented: navigation" 을 console.error 로 흘린다 — 실패가 아니라 잡음이라 막는다.
  */
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** 로그인 폼을 채우고 제출한다. 빈 값 검증도 봐야 해서 `required` 는 우회한다. */
function submitLogin({ email, password }: { email: string; password: string }) {
  const { container } = render(<LoginPage />);

  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: password },
  });

  // jsdom 은 제출 전 제약 검증(`required`)을 돌리지 않지만, 돌더라도 우리가 보려는 것은
  // 브라우저 기본 동작이 아니라 `handleSubmit` 의 판정이다.
  const form = container.querySelector("form");
  if (!form) throw new Error("로그인 폼을 찾지 못했다");
  form.noValidate = true;

  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

describe("LoginPage 비밀번호 검증", () => {
  // 예전 규칙은 여기서 20자 상한에 걸려 요청을 아예 보내지 않았다.
  it("20자를 넘는 비밀번호도 친 그대로 서버로 보낸다", async () => {
    expect(LONG_PASSWORD).toHaveLength(25);

    submitLogin({ email: LOGIN_EMAIL, password: LONG_PASSWORD });

    await waitFor(() =>
      expect(mockLoginWithEmail).toHaveBeenCalledWith(
        LOGIN_EMAIL,
        LONG_PASSWORD,
      ),
    );
  });

  // 예전 규칙은 여기서 문자 클래스에 걸려 "영문, 숫자, 특수문자만" 이라고 말했다.
  it("가입 문자 클래스 밖의 문자가 든 비밀번호도 친 그대로 서버로 보낸다", async () => {
    submitLogin({ email: LOGIN_EMAIL, password: SPECIAL_PASSWORD });

    await waitFor(() =>
      expect(mockLoginWithEmail).toHaveBeenCalledWith(
        LOGIN_EMAIL,
        SPECIAL_PASSWORD,
      ),
    );
  });

  // 이메일은 trim 하지만 비밀번호는 안 한다. 잘라내면 다른 비밀번호를 보내는 것이다.
  it("비밀번호의 앞뒤 공백을 잘라내지 않는다", async () => {
    submitLogin({ email: `  ${LOGIN_EMAIL}  `, password: SPACED_PASSWORD });

    await waitFor(() =>
      expect(mockLoginWithEmail).toHaveBeenCalledWith(
        LOGIN_EMAIL,
        SPACED_PASSWORD,
      ),
    );
  });

  // 서버에 물어볼 것이 없는 유일한 경우. 여기만 화면이 막는다.
  it("빈 비밀번호는 화면에서 막고 서버로 보내지 않는다", async () => {
    submitLogin({ email: LOGIN_EMAIL, password: "" });

    expect(
      await screen.findByText("비밀번호를 입력해 주세요."),
    ).toBeInTheDocument();
    expect(mockLoginWithEmail).not.toHaveBeenCalled();
  });
});

/** 이메일은 서버에 넘기지 않는다 — 필수 이메일 필드라 형식 판정이 화면의 몫이다. */
describe("LoginPage 이메일 검증", () => {
  it("형식이 아닌 이메일은 화면에서 막고 서버로 보내지 않는다", async () => {
    submitLogin({ email: "harucut", password: LONG_PASSWORD });

    expect(
      await screen.findByText("이메일 형식이 올바르지 않습니다."),
    ).toBeInTheDocument();
    expect(mockLoginWithEmail).not.toHaveBeenCalled();
  });

  it("빈 이메일은 화면에서 막고 서버로 보내지 않는다", async () => {
    submitLogin({ email: "   ", password: LONG_PASSWORD });

    expect(
      await screen.findByText("이메일을 입력해 주세요."),
    ).toBeInTheDocument();
    expect(mockLoginWithEmail).not.toHaveBeenCalled();
  });
});
