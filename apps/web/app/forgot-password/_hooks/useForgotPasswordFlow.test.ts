/**
 * 재설정 토큰이 만료되거나 이미 쓰였으면(401 AUTH-011) 코드 단계로 되돌린다.
 *
 * 공통 문구표의 AUTH-011 은 「다시 로그인」이다. 비밀번호를 잊은 사람에게는 틀린 안내라 이 흐름만
 * 따로 말한다. 분기가 빠지거나 코드 문자열이 어긋나면 공통 문구로 떨어지는데, 화면만 봐서는
 * 서버가 그렇게 답한 것과 구분되지 않아 여기서 못 박는다.
 */
import { act, renderHook } from "@testing-library/react";
import { useForgotPasswordFlow } from "@/app/forgot-password/_hooks/useForgotPasswordFlow";
import { ApiRequestError } from "@/lib/clientApi";

const mockRequestCode = jest.fn();
const mockVerifyCode = jest.fn();
const mockResetPassword = jest.fn();

jest.mock("@/lib/auth/passwordResetApi", () => ({
  requestPasswordResetCode: (...args: unknown[]) => mockRequestCode(...args),
  verifyPasswordResetCode: (...args: unknown[]) => mockVerifyCode(...args),
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

const EMAIL = "reset@example.com";
const NEW_PASSWORD = "harucut1234!";

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestCode.mockResolvedValue(undefined);
  mockVerifyCode.mockResolvedValue("reset-token");
  // 훅이 실패를 console 에도 남긴다. 테스트 출력의 잡음이라 막는다.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** 코드를 받아 확인하고 새 비밀번호까지 친 상태 — 제출만 남았다. */
async function reachResetStep() {
  const { result } = renderHook(() => useForgotPasswordFlow());

  act(() => result.current.setEmail(EMAIL));
  await act(async () => {
    await result.current.sendCode();
  });
  act(() => result.current.setCode("VJG4K4"));
  await act(async () => {
    await result.current.verifyCode();
  });
  act(() => {
    result.current.setNewPassword(NEW_PASSWORD);
    result.current.setConfirmPassword(NEW_PASSWORD);
  });

  expect(result.current.step).toBe("RESET_PASSWORD");
  return result;
}

it("AUTH-011 이면 이메일은 두고 코드 단계로 되돌려 새 코드를 받게 한다", async () => {
  mockResetPassword.mockRejectedValue(
    new ApiRequestError({ status: 401, code: "AUTH-011" }),
  );
  const result = await reachResetStep();

  let ok: boolean | undefined;
  await act(async () => {
    ok = await result.current.submitNewPassword();
  });

  expect(ok).toBe(false);
  expect(mockResetPassword).toHaveBeenCalledWith("reset-token", NEW_PASSWORD);
  expect(result.current.step).toBe("VERIFY_CODE");
  expect(result.current.errors).toEqual({
    code: "인증 시간이 지났어요. 인증 코드를 다시 받아 주세요.",
  });
  // 지난 코드와 시계를 비워야 화면이 「인증 확인」 대신 「코드 보내기」를 내민다.
  expect(result.current.code).toBe("");
  expect(result.current.codeExpiresAt).toBeNull();
  expect(result.current.email).toBe(EMAIL);
});

it("AUTH-011 이 아닌 실패는 단계를 두고 공통 자리에 알린다", async () => {
  mockResetPassword.mockRejectedValue(new Error("network down"));
  const result = await reachResetStep();

  await act(async () => {
    await result.current.submitNewPassword();
  });

  expect(result.current.step).toBe("RESET_PASSWORD");
  expect(result.current.errors).toEqual({
    common: "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
  });
});
