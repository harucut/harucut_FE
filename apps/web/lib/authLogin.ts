import type { SocialProvider } from "@harucut/shared";
import {
  persistSocialLoginProvider,
  persistSocialLoginRedirect,
} from "@/lib/socialLoginRedirect";

const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

export function socialAuthorizeUrl(provider: SocialProvider) {
  return `${backendBase}/oauth2/authorization/${provider}`;
}

/**
 * 소셜 인가로 넘긴다. 돌아올 곳(redirectTo)과 **어느 제공자였는지**를 함께 남긴다.
 * 제공자를 남기는 이유는 socialLoginRedirect.ts 의 persistSocialLoginProvider 주석 참고.
 */
export function startSocialLogin(
  provider: SocialProvider,
  redirectTo?: string | null,
) {
  persistSocialLoginRedirect(redirectTo);
  persistSocialLoginProvider(provider);
  window.location.href = socialAuthorizeUrl(provider);
}

// 백엔드 Google OAuth 등록 예정. 등록 전에는 콜백이 실패할 수 있음(프런트 버튼 선반영).
export function loginGoogle(redirectTo?: string | null) {
  startSocialLogin("google", redirectTo);
}

export function loginKakao(redirectTo?: string | null) {
  startSocialLogin("kakao", redirectTo);
}

export function loginNaver(redirectTo?: string | null) {
  startSocialLogin("naver", redirectTo);
}
