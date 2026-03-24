import { persistSocialLoginRedirect } from "@/lib/socialLoginRedirect";

const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

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
