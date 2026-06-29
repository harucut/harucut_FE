import { persistSocialLoginRedirect } from "@/lib/socialLoginRedirect";

const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

// 백엔드 Google OAuth 등록 예정. 등록 전에는 콜백이 실패할 수 있음(프런트 버튼 선반영).
export function loginGoogle(redirectTo?: string | null) {
  persistSocialLoginRedirect(redirectTo);
  const googleAuthUrl = `${backendBase}/oauth2/authorization/google`;
  window.location.href = googleAuthUrl;
}

export function loginKakao(redirectTo?: string | null) {
  persistSocialLoginRedirect(redirectTo);
  const kakaoAuthUrl = `${backendBase}/oauth2/authorization/kakao`;
  window.location.href = kakaoAuthUrl;
}

export function loginNaver(redirectTo?: string | null) {
  persistSocialLoginRedirect(redirectTo);
  const naverAuthUrl = `${backendBase}/oauth2/authorization/naver`;
  window.location.href = naverAuthUrl;
}
