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

  // 브라우저는 URL의 역슬래시(\)를 슬래시(/)로 정규화하고 탭/개행 같은 제어문자는 제거한다.
  // 이 동작을 먼저 흡수하지 않으면 "/\evil.com"·"/\t/evil.com" 같은 입력이 검사를 통과한 뒤
  // 실제로는 protocol-relative 외부 URL("//evil.com")로 해석돼 오픈 리다이렉트가 된다.
  const target = candidate.trim().replace(/[\t\n\r]/g, "");

  // 단일 슬래시로 시작하는 내부 경로만 허용한다.
  //  - target[0] !== "/"     → 스킴 포함 절대 URL(https:, javascript: 등) 차단
  //  - target[1] === "/"     → protocol-relative("//host") 차단
  //  - target.includes("\\") → 브라우저 정규화로 "//host"가 될 수 있는 역슬래시 차단
  if (
    !target ||
    target[0] !== "/" ||
    target[1] === "/" ||
    target.includes("\\")
  ) {
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
