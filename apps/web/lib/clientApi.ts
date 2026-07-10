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

// 쿠키 기반 액세스 토큰 재발급. 자체 401 재시도는 하지 않는다(exempt).
async function reissueAccessToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/client/reissue", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
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
    const reissued = await reissueAccessToken();
    // 재발급 성공 시에만 재시도한다. 재시도 fetch의 오류(취소·네트워크)는 그대로 전파해
    // 유효 세션을 만료로 오인하지 않는다. 재발급 실패면 최초 401 응답을 유지한다.
    if (reissued) {
      res = await doFetch();
    }
    if (res.status === 401) {
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
