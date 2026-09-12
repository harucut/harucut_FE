import type { SocialProvider } from "@harucut/shared";
import { getSafeRedirectPath } from "@/lib/redirect";

const SOCIAL_LOGIN_REDIRECT_KEY = "social-login-redirect";
const SOCIAL_LOGIN_PROVIDER_KEY = "social-login-provider";
const SOCIAL_LOGIN_REACTIVATED_KEY = "social-login-reactivated";

const SOCIAL_PROVIDERS = new Set<SocialProvider>(["google", "kakao", "naver"]);

export function persistSocialLoginRedirect(candidate?: string | null) {
  if (typeof window === "undefined") return;

  const redirectTo = getSafeRedirectPath(candidate);
  if (!redirectTo) {
    window.sessionStorage.removeItem(SOCIAL_LOGIN_REDIRECT_KEY);
    return;
  }

  window.sessionStorage.setItem(SOCIAL_LOGIN_REDIRECT_KEY, redirectTo);
}

export function consumeSocialLoginRedirect() {
  if (typeof window === "undefined") return null;

  const stored = window.sessionStorage.getItem(SOCIAL_LOGIN_REDIRECT_KEY);
  window.sessionStorage.removeItem(SOCIAL_LOGIN_REDIRECT_KEY);
  return getSafeRedirectPath(stored);
}

/**
 * 어느 소셜로 들어왔는지 남긴다.
 *
 * 콜백에서 탈퇴 취소(reactivate)를 하면 서버가 새 쿠키를 주지 않고 refresh 토큰까지 지운다
 * (docs/backend-contract.md). 손에 든 토큰은 status=DELETED_REQUESTED 인 채라 계속 403 이므로,
 * 복구 뒤에는 반드시 로그인을 다시 태워야 한다. 이메일 로그인은 방금 받은 자격증명을 다시 쓰면
 * 되지만 소셜은 그게 없다 — 그래서 어느 제공자였는지를 여기 적어 두고 그 인가를 다시 태운다.
 */
export function persistSocialLoginProvider(provider: SocialProvider) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SOCIAL_LOGIN_PROVIDER_KEY, provider);
}

/** 지우지 않고 읽기만 한다 — 정상 경로와 복구 경로가 같은 값을 봐야 한다. */
export function readSocialLoginProvider(): SocialProvider | null {
  if (typeof window === "undefined") return null;

  const stored = window.sessionStorage.getItem(SOCIAL_LOGIN_PROVIDER_KEY);
  return stored && SOCIAL_PROVIDERS.has(stored as SocialProvider)
    ? (stored as SocialProvider)
    : null;
}

export function clearSocialLoginProvider() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SOCIAL_LOGIN_PROVIDER_KEY);
  window.sessionStorage.removeItem(SOCIAL_LOGIN_REACTIVATED_KEY);
}

/**
 * 복구 후 소셜 인가를 다시 태우는 것은 **한 번만** 허용한다.
 *
 * 두 번째 콜백에서도 DELETED_REQUESTED 가 오면(복구가 안 먹었거나 서버가 예상과 다르면)
 * 같은 분기가 또 인가로 넘겨 브라우저가 무한히 왕복한다. 그 경우엔 그냥 로그인 화면으로 보낸다.
 */
export function markSocialLoginReactivated() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SOCIAL_LOGIN_REACTIVATED_KEY, "1");
}

export function hasSocialLoginReactivated() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SOCIAL_LOGIN_REACTIVATED_KEY) === "1";
}
