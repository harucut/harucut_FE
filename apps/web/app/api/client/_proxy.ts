import { NextResponse } from "next/server";
import {
  adaptSetCookiesForRequest,
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

export async function forward(
  req: Request,
  options: ProxyOptions,
): Promise<ForwardResult> {
  const upstreamUrl = getAbsoluteUrlOrNull(options.url);
  if (!upstreamUrl) {
    return buildProxyErrorResult(
      500,
      "CLIENT-002",
      "NEXT_PUBLIC_BASE_URL is not set or invalid.",
    );
  }

  const rawCookie = req.headers.get("cookie") ?? "";
  const cookie = options.stripAuthCookies
    ? stripAuthCookies(rawCookie)
    : rawCookie;
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
    return buildProxyErrorResult(
      502,
      "CLIENT-003",
      "Failed to reach backend server.",
    );
  }

  const responseBody = await upstream.text();
  const contentType =
    upstream.headers.get("content-type") ?? "application/json";

  return {
    ok: upstream.ok,
    status: upstream.status,
    body: responseBody,
    contentType,
    setCookies: getSetCookieHeaders(upstream.headers),
  };
}

export function buildResponse(result: ForwardResult, req?: RequestLike) {
  const res = new NextResponse(result.body, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
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
