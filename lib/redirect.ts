const BLOCKED_REDIRECT_PREFIXES = ["/login", "/signup", "/forgot-password"];

function isBlockedRedirectPath(target: string) {
  return BLOCKED_REDIRECT_PREFIXES.some((prefix) => {
    return (
      target === prefix ||
      target.startsWith(`${prefix}/`) ||
      target.startsWith(`${prefix}?`) ||
      target.startsWith(`${prefix}#`)
    );
  });
}

export function getSafeRedirectPath(candidate: string | null | undefined) {
  if (!candidate) return null;

  const target = candidate.trim();
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return null;
  }

  if (isBlockedRedirectPath(target)) {
    return null;
  }

  return target;
}

export function resolveRedirectTarget(
  candidate: string | null | undefined,
  fallback: string = "/home",
) {
  return getSafeRedirectPath(candidate) ?? fallback;
}

export function buildPathWithRedirect(
  path: string,
  candidate: string | null | undefined,
) {
  const redirectTo = getSafeRedirectPath(candidate);
  if (!redirectTo) return path;

  const url = new URL(path, "http://localhost");
  url.searchParams.set("redirectTo", redirectTo);
  return `${url.pathname}${url.search}`;
}
