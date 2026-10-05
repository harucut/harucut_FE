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
 * 제공자 화면에서 취소했거나 인가가 실패했을 때의 안내.
 * 콜백(`?error=`)과 그 콜백이 돌려보내는 로그인 화면(`?socialError=1`)이 같은 문구를 쓴다.
 */
export const SOCIAL_LOGIN_FAILED_MESSAGE =
  "로그인을 마치지 못했어요. 다시 시도해 주세요.";
