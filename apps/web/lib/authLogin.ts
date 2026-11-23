import type { SocialProvider } from "@harucut/shared";
import {
  persistSocialLoginProvider,
  persistSocialLoginRedirect,
} from "@/lib/socialLoginRedirect";

const backendBase = process.env.NEXT_PUBLIC_BASE_URL;

// 함수로 둔다 — 템플릿 문자열을 바로 대입하면 앞이 `${}` 라 lint 가 상대 경로로 오인한다.
function socialAuthorizeUrl(provider: SocialProvider) {
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

/**
 * 소셜·앱 로그인을 끝내지 못하고 로그인 화면(`?socialError=1`)으로 돌아왔을 때 폼 위에 띄우는 한 줄.
 * 다시 시도할 단추가 바로 아래 있어서 「다시 시도해 주세요」는 붙이지 않는다(2026-11-14 한 문장으로 줄임).
 */
export const SOCIAL_LOGIN_FAILED_MESSAGE = "로그인을 마치지 못했어요.";
