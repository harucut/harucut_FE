"use client";

type ApiEnvelopeLike = {
  code?: string;
  status?: number;
  message?: string | null;
};

type ApiResult<T> = {
  data: T;
  ok: boolean;
  status: number;
  headers: Headers;
};

type ApiOptions = {
  headers?: HeadersInit;
  cache?: RequestCache;
  signal?: AbortSignal;
};

function extractEnvelopeLike(value: unknown): ApiEnvelopeLike | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
    message:
      typeof record.message === "string" || record.message === null
        ? (record.message as string | null)
        : undefined,
  };
}

export class ApiRequestError<T = unknown> extends Error {
  status?: number;
  data?: T;
  code?: string;
  apiMessage?: string | null;

  constructor(args: {
    status?: number;
    data?: T;
    code?: string;
    apiMessage?: string | null;
  }) {
    super(args.apiMessage || "API request failed");
    this.name = "ApiRequestError";
    this.status = args.status;
    this.data = args.data;
    this.code = args.code;
    this.apiMessage = args.apiMessage;
  }
}

// 재발급 요청 자체 및 비인증(로그인/회원가입/비밀번호 재설정) BFF 경로는
// 401이 정상이거나 재발급 대상이 아니므로 자동 재발급/재시도에서 제외한다(무한 루프 방지).
const SESSION_REFRESH_EXEMPT_PATHS = new Set<string>([
  "/api/client/reissue",
  "/api/client/auth/login",
  "/api/client/auth/register",
  "/api/client/auth/email/code",
  "/api/client/auth/email/verification",
  "/api/client/auth/password/reset",
  "/api/client/auth/password/reset/code",
  "/api/client/auth/password/reset/verification",
  "/api/client/logout",
]);

// 재발급까지 실패해 세션이 끊긴 것으로 판정됐을 때 호출되는 핸들러.
// 페이지가 로그인 유도 등을 붙일 수 있도록 레지스트리로 위임한다(기본 동작 없음 =
// 각 화면의 기존 401 처리를 유지, 등록 시 전역 만료 처리 추가).
let onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

/**
 * 재발급 결과. 실패를 한 덩어리로 묶지 않는다.
 * - `expired`: refresh 쿠키까지 만료·무효라 진짜로 세션이 끊긴 경우(401·403)
 * - `unavailable`: 재발급 엔드포인트가 일시적으로 못 답한 경우(5xx·네트워크 오류)
 *
 * 후자를 세션 만료로 취급하면 잠깐의 장애나 오프라인이 곧바로 로그인 화면 강제 이동이 된다.
 */
type ReissueResult = "ok" | "expired" | "unavailable";

// 쿠키 기반 액세스 토큰 재발급. 자체 401 재시도는 하지 않는다(exempt).
async function reissueAccessToken(): Promise<ReissueResult> {
  try {
    const res = await fetch("/api/client/reissue", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "expired" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: ApiOptions = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers);
  const hasBody = body !== undefined;

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const doFetch = () =>
    fetch(path, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      credentials: "include",
      cache: options.cache,
      signal: options.signal,
    });

  let res = await doFetch();

  // 액세스 토큰 만료(401)면 쿠키 기반으로 1회 재발급 후 원요청을 재시도한다.
  // 재발급까지 실패하면(여전히 401) 세션이 끊긴 것으로 보고 등록된 만료 핸들러를 호출한다.
  if (res.status === 401 && !SESSION_REFRESH_EXEMPT_PATHS.has(path)) {
    const reissue = await reissueAccessToken();
    // 재발급 성공 시에만 재시도한다. 재시도 fetch의 오류(취소·네트워크)는 그대로 전파해
    // 유효 세션을 만료로 오인하지 않는다. 재발급 실패면 최초 401 응답을 유지한다.
    if (reissue === "ok") {
      res = await doFetch();
    }
    // 재발급 서버가 일시적으로 못 답한 경우(unavailable)는 세션 만료로 단정하지 않는다.
    // 최초 401을 그대로 돌려보내 화면이 재시도 가능한 API 오류로 다루게 한다.
    if (res.status === 401 && reissue !== "unavailable") {
      onSessionExpired?.();
    }
  }

  const text = await res.text();
  let data = null as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }
  }

  if (!res.ok) {
    const envelope = extractEnvelopeLike(data);
    throw new ApiRequestError<T>({
      status: res.status,
      data,
      code: envelope?.code,
      apiMessage: envelope?.message,
    });
  }

  return {
    data,
    ok: res.ok,
    status: res.status,
    headers: res.headers,
  };
}

export const clientApi = {
  get<T>(path: string, options?: ApiOptions) {
    return request<T>("GET", path, undefined, options);
  },
  post<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("POST", path, body, options);
  },
  patch<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("PATCH", path, body, options);
  },
  put<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("PUT", path, body, options);
  },
  delete<T>(path: string, options?: ApiOptions) {
    return request<T>("DELETE", path, undefined, options);
  },
};
