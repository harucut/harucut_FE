import { getSafeRedirectPath } from "@/lib/redirect";

const SOCIAL_LOGIN_REDIRECT_KEY = "social-login-redirect";

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
