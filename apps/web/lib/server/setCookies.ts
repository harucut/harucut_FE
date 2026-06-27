type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function splitCombinedSetCookie(value: string) {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let i = 0; i < value.length; i += 1) {
    const current = value[i];
    const nextExpires = value.slice(i, i + 8).toLowerCase();

    if (nextExpires === "expires=") {
      inExpires = true;
    }

    if (inExpires && current === ";") {
      inExpires = false;
    }

    if (current === "," && !inExpires) {
      cookies.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }

  const last = value.slice(start).trim();
  if (last) {
    cookies.push(last);
  }

  return cookies;
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    return setCookies;
  }

  const single = headers.get("set-cookie");
  return single ? splitCombinedSetCookie(single) : [];
}

type RequestLike = Pick<Request, "headers" | "url">;

function getRequestUrl(req: RequestLike) {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    url.host = forwardedHost;
  }
  if (forwardedProto) {
    url.protocol = `${forwardedProto}:`;
  }

  return url;
}

function shouldStripCookieDomain(hostname: string, domain: string) {
  const normalizedHost = hostname.trim().toLowerCase();
  const normalizedDomain = domain.trim().replace(/^\./, "").toLowerCase();

  if (!normalizedDomain) {
    return false;
  }

  return (
    normalizedHost !== normalizedDomain &&
    !normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

export function adaptSetCookieForRequest(setCookie: string, req: RequestLike) {
  const url = getRequestUrl(req);
  const hostname = url.hostname.toLowerCase();
  let nextCookie = setCookie;

  const domainMatch = nextCookie.match(/;\s*Domain=([^;]+)/i);
  if (domainMatch && shouldStripCookieDomain(hostname, domainMatch[1])) {
    nextCookie = nextCookie.replace(/;\s*Domain=[^;]+/i, "");
  }

  if (url.protocol !== "https:") {
    // 로컬(http) 개발에선 Secure를 떼야 쿠키가 저장되는데, SameSite=None은 Secure가 없으면
    // 브라우저가 거부한다. 백엔드 인증 쿠키(accessToken/refreshToken)가 localhost에서도
    // 저장되도록 None을 Lax로 낮춘다. (https 운영 환경에선 이 블록을 타지 않아 원본 유지)
    nextCookie = nextCookie.replace(/;\s*Secure/gi, "");
    nextCookie = nextCookie.replace(/;\s*SameSite=None/gi, "; SameSite=Lax");
  }

  return nextCookie;
}

export function adaptSetCookiesForRequest(
  setCookies: string[],
  req: RequestLike,
) {
  return setCookies.map((cookie) => adaptSetCookieForRequest(cookie, req));
}
