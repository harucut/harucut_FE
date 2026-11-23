import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, LoginResponseData } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

// 백엔드 LocalLoginRequest는 email·password만 받는다(스웨거 기준).
// 세션 지속 옵션(remember) 계약은 없으므로 보내지 않는다 — 추가되면 여기에 반영한다.
export async function loginWithEmail(email: string, password: string) {
  const res = await clientApi.post<ApiEnvelope<LoginResponseData>>(
    "/api/client/auth/login",
    {
      email,
      password,
    },
  );

  return requireData(res.data, "로그인 결과");
}

export async function sendEmailAuthCode(email: string) {
  await clientApi.post("/api/client/auth/email/code", { email });
}

export async function verifyEmailAuthCode(email: string, code: string) {
  await clientApi.post("/api/client/auth/email/verification", { email, code });
}

// 백엔드 LocalRegisterRequest는 email·username·password만 받는다(스웨거 기준).
// 마케팅/약관 동의 필드는 아직 백엔드 계약에 없으므로 전송하지 않는다(추가되면 여기 반영).
export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  const res = await clientApi.post("/api/client/auth/register", args);
  return res.data;
}

/**
 * 앱 로그인(P4) 일회용 코드 교환. 응답 쿠키는 로그인과 같다 — WebView 안에서 불러야 쿠키가 WebView 에 남는다.
 * 없음·만료·사용됨·검증값 불일치는 400 AUTH-041 하나, 형식 오류는 400 GEN-003.
 */
export async function exchangeAppLoginCode(code: string, codeVerifier: string) {
  await clientApi.post("/api/client/auth/oauth2/exchange", { code, codeVerifier });
}

export async function reactivateAccount() {
  await clientApi.post<ApiEnvelope<null>>("/api/client/reactivate");
}
