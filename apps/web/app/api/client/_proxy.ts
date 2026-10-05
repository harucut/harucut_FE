import { NextResponse } from "next/server";
import {
  adaptSetCookiesForRequest,
  getRequestUrl,
  getSetCookieHeaders,
} from "@/lib/server/setCookies";

type ProxyOptions = {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  forwardBody?: boolean;
  contentType?: string;
  extraHeaders?: Record<string, string>;
  /**
   * 로그인/회원가입 등 비인증 엔드포인트로 프록시할 때 true.
   * 브라우저에 남아있는 만료/무효 accessToken·refreshToken 쿠키를 함께 보내면
   * 백엔드 인증 필터가 그 토큰을 검증해 INVALID_ACCESS_TOKEN(401)으로 막아버리므로,
   * 인증 토큰 쿠키만 제거하고 나머지(게스트 쿠키 등)는 그대로 전달한다.
   */
  stripAuthCookies?: boolean;
};

const AUTH_COOKIE_NAMES = new Set(["accessToken", "refreshToken"]);

function stripAuthCookies(cookie: string): string {
  return cookie
    .split(/;\s*/)
    .filter((part) => {
      const name = part.split("=")[0]?.trim();
      return name ? !AUTH_COOKIE_NAMES.has(name) : false;
    })
    .join("; ");
}

type ForwardResult = {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  setCookies: string[];
};

type RequestLike = Pick<Request, "headers" | "url">;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/**
 * 백엔드까지 가지 못했을 때 프록시가 스스로 만들어 내보내는 에러 봉투.
 *
 * 여기 쓰는 code 는 서버 ErrorCode 가 아니라 **클라이언트 코드**라서 `CLIENT-` 접두사를 쓴다.
 * 서버 네임스페이스(`GEN-` 등)를 빌려 쓰면 계약 검사기(scripts/check_backend_contract.py)의
 * 서버 enum 대조에 걸리지도 않으면서 서버 코드인 척하게 된다.
 *
 * 짝이 되는 사용자 문구는 `packages/shared/src/api-error-messages.ts` 의
 * 「클라이언트 자체 코드」 블록에 있다. 표에 없는 코드를 내면 `getUserFacingApiErrorMessage`
 * 가 화면별 폴백을 그대로 돌려주고, 로그인 화면이라면 백엔드가 죽은 것을
 * "이메일 또는 비밀번호가 올바르지 않아요" 라고 말한다. 코드를 바꿀 때는 표도 같이 고친다.
 *
 * 상수를 import 하지 않고 문자열로 두는 이유: 이 트리의 route 34개가 전부
 * `runtime = "edge"` 라 `@harucut/shared` 배럴을 끌어오면 edge 번들에 shared 가 통째로 딸려 온다.
 *
 * 영문 `message` 는 그대로 둔다 — 화면에는 안 나가고(apiError.ts 가 버린다) 로그가 읽는 값이다.
 */
function buildProxyErrorResult(
  status: number,
  code: string,
  message: string,
): ForwardResult {
  return {
    ok: false,
    status,
    body: JSON.stringify({
      code,
      status,
      message,
      data: null,
    }),
    contentType: JSON_CONTENT_TYPE,
    setCookies: [],
  };
}

function getAbsoluteUrlOrNull(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

/**
 * 우리 화면(같은 출처)이 아닌 곳이 시킨 요청인가.
 *
 * 이 프록시는 쿠키를 그대로 싣고 Content-Type 을 JSON 으로 고쳐 보낸다. 그래서 남의 사이트의
 * `<form enctype="text/plain">` 처럼 사전 요청 없이 나가는 단순 POST 도 백엔드에는 멀쩡한 JSON 으로
 * 닿는다 — 피해자를 공격자 계정으로 로그인시키는 로그인 CSRF 다.
 *
 * `Sec-Fetch-Site` 가 있으면 그것만 본다(same-origin·none 만 통과). same-site 도 막는다 — 우리 화면은
 * 늘 상대 경로로 부르니 하위 도메인(api. 등)에서 올 일이 없고, 아래 Origin 판정도 같은 출처만 받는다.
 * 브라우저는 이 헤더를 https·localhost 에만 붙여서, 구형 브라우저와 LAN 개발 주소(에뮬레이터의
 * http://10.0.2.2:3000)에서는 `Origin` 으로 판정한다. 그 비교 대상은 req.url 이 아니라 브라우저가
 * 부른 주소다 — 자체 호스팅에서는 req.url 이 늘 localhost 라 그대로 맞대면 개발 앱의 요청이 전부 막힌다.
 * 둘 다 없으면 브라우저가 보낸 요청이 아니다 — 남의 쿠키를 실을 수 없으니 통과시킨다.
 */
function isCrossSiteRequest(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  return origin !== null && origin !== getRequestUrl(req).origin;
}

export async function forward(
  req: Request,
  options: ProxyOptions,
): Promise<ForwardResult> {
  // 상태를 바꾸는 요청만 막는다. GET 은 바꾸는 것이 없고, 응답은 CORS 가 남의 사이트에 안 보여 준다.
  if (options.method !== "GET" && isCrossSiteRequest(req)) {
    return buildProxyErrorResult(403, "CLIENT-005", "Cross-site request blocked.");
  }

  const upstreamUrl = getAbsoluteUrlOrNull(options.url);
  if (!upstreamUrl) {
    return buildProxyErrorResult(
      500,
      "CLIENT-002",
      "NEXT_PUBLIC_BASE_URL is not set or invalid.",
    );
  }

  const rawCookie = req.headers.get("cookie") ?? "";
  const cookie = options.stripAuthCookies ? stripAuthCookies(rawCookie) : rawCookie;
  const shouldForwardBody =
    options.forwardBody ?? (options.method !== "GET" && options.method !== "DELETE");
  const body = shouldForwardBody ? await req.text() : undefined;

  const headers: Record<string, string> = { ...(options.extraHeaders ?? {}) };
  if (body !== undefined) {
    headers["Content-Type"] = options.contentType ?? "application/json";
  }
  if (cookie) headers.cookie = cookie;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: options.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch {
    return buildProxyErrorResult(502, "CLIENT-003", "Failed to reach backend server.");
  }

  let responseBody: string;
  try {
    responseBody = await upstream.text();
  } catch {
    // 헤더를 받은 뒤 끊긴 연결도 같은 장애다. 이미 갱신된 인증 쿠키는 잃지 않는다.
    return {
      ...buildProxyErrorResult(502, "CLIENT-003", "Failed to read backend response."),
      setCookies: getSetCookieHeaders(upstream.headers),
    };
  }
  const contentType = upstream.headers.get("content-type") ?? "application/json";

  return {
    ok: upstream.ok,
    status: upstream.status,
    body: responseBody,
    contentType,
    setCookies: getSetCookieHeaders(upstream.headers),
  };
}

export function buildResponse(result: ForwardResult, req?: RequestLike) {
  // 빈 문자열도 body다. 본문이 금지된 상태에서는 null이어야 Response 생성이 성공한다.
  const body = [204, 205, 304].includes(result.status) ? null : result.body;
  const res = new NextResponse(body, {
    status: result.status,
    headers: { "Content-Type": result.contentType, "Cache-Control": "private, no-store" },
  });
  const setCookies = req
    ? adaptSetCookiesForRequest(result.setCookies, req)
    : result.setCookies;

  for (const cookie of setCookies) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}

export async function proxyJson(req: Request, options: ProxyOptions) {
  const result = await forward(req, options);
  return buildResponse(result, req);
}

export function validateResourceId(id: string): NextResponse | null {
  if (/^[1-9][0-9]{0,18}$/.test(id) && (id.length < 19 || id <= "9223372036854775807")) return null;
  return buildResponse(buildProxyErrorResult(400, "CLIENT-006", "Invalid resource ID."));
}
