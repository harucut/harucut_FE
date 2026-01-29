import { api } from "@/lib/api";

/** 이메일 로그인 */
export async function loginWithEmail(email: string, password: string) {
  await api.post("/api/harucut/login", { email, password });
}

/** 이메일 인증 코드 전송 */
export async function sendEmailAuthCode(email: string) {
  await api.post("/api/email-auth/code", { email });
}

/** 이메일 인증 코드 검증 */
export async function verifyEmailAuthCode(email: string, code: string) {
  await api.post("/api/email-auth/verification", { email, code });
}

/** 이메일 회원가입 */
export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  const res = await api.post("/api/harucut/register", args);
  return res.data;
}
