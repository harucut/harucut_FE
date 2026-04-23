"use client";

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

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

if (!baseURL) {
  throw new Error("NEXT_PUBLIC_BASE_URL is not set");
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

  const res = await fetch(`${baseURL}${path}`, {
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
    const error = new Error("API request failed");
    (error as { status?: number }).status = res.status;
    (error as { data?: T }).data = data;
    throw error;
  }

  return {
    data,
    ok: res.ok,
    status: res.status,
    headers: res.headers,
  };
}

export const api = {
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
