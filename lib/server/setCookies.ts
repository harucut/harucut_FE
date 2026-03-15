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
    nextCookie = nextCookie.replace(/;\s*Secure/gi, "");
  }

  return nextCookie;
}

export function adaptSetCookiesForRequest(
  setCookies: string[],
  req: RequestLike,
) {
  return setCookies.map((cookie) => adaptSetCookieForRequest(cookie, req));
}
