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

  const res = await fetch(path, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    credentials: "include",
    cache: options.cache,
    signal: options.signal,
  });

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
