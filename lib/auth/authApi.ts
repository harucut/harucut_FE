import { clientApi } from "@/lib/clientApi";

/** 이메일 로그인 */
export async function loginWithEmail(email: string, password: string) {
  await clientApi.post("/api/client/auth/login", { email, password });
}

/** 이메일 인증 코드 전송 */
export async function sendEmailAuthCode(email: string) {
  await clientApi.post("/api/client/auth/email/code", { email });
}

/** 이메일 인증 코드 검증 */
export async function verifyEmailAuthCode(email: string, code: string) {
  await clientApi.post("/api/client/auth/email/verification", { email, code });
}

/** 이메일 회원가입 */
export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  const res = await clientApi.post("/api/client/auth/register", args);
  return res.data;
}
