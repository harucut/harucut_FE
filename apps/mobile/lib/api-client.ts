import Constants from 'expo-constants';

export type ApiEnvelope<T> = {
  code?: string;
  data: T;
  message?: string | null;
  status?: number;
};

type ApiPath =
  | string
  | {
      direct: string;
      proxy: string;
    };

type RequestOptions = {
  body?: unknown;
  cache?: RequestCache;
  headers?: HeadersInit;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  signal?: AbortSignal;
  /** 내부용: 401 자동 재발급/재시도를 건너뛴다(재발급 요청 자체의 무한 루프 방지). */
  skipAuthRefresh?: boolean;
};

const DEFAULT_API_BASE_URL = 'https://api.harucut.com';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function configuredApiBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) return fromEnv;

  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra;
  }

  return DEFAULT_API_BASE_URL;
}

function configuredWebProxyBaseUrl() {
  return process.env.EXPO_PUBLIC_WEB_API_BASE_URL?.trim() ?? '';
}

export function getApiConfig() {
  const directBaseUrl = configuredApiBaseUrl();
  const webProxyBaseUrl = configuredWebProxyBaseUrl();

  if (directBaseUrl) {
    return {
      baseUrl: trimTrailingSlash(directBaseUrl),
      mode: 'direct' as const,
    };
  }

  if (webProxyBaseUrl) {
    return {
      baseUrl: trimTrailingSlash(webProxyBaseUrl),
      mode: 'proxy' as const,
    };
  }

  return {
    baseUrl: DEFAULT_API_BASE_URL,
    mode: 'direct' as const,
  };
}

export function isUsingWebProxy() {
  return getApiConfig().mode === 'proxy';
}

function resolvePath(path: ApiPath) {
  if (typeof path === 'string') return path;
  return getApiConfig().mode === 'proxy' ? path.proxy : path.direct;
}

function extractEnvelopeLike(value: unknown) {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;

  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    message:
      typeof record.message === 'string' || record.message === null
        ? (record.message as string | null)
        : undefined,
    status: typeof record.status === 'number' ? record.status : undefined,
  };
}

export class ApiRequestError<T = unknown> extends Error {
  apiMessage?: string | null;
  code?: string;
  data?: T;
  status?: number;

  constructor(args: {
    apiMessage?: string | null;
    code?: string;
    data?: T;
    status?: number;
  }) {
    super(args.apiMessage || 'API request failed');
    this.name = 'ApiRequestError';
    this.apiMessage = args.apiMessage;
    this.code = args.code;
    this.data = args.data;
    this.status = args.status;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError && error.apiMessage) {
    return error.apiMessage;
  }

  if (error instanceof Error && error.message && error.message !== 'API request failed') {
    return error.message;
  }

  return fallback;
}

// 401(액세스 토큰 만료) 시 1회 재발급 후 재시도하되, 아래 경로들은 401이 정상이거나
// 재발급 요청 자체라 자동 재발급/재시도 대상에서 제외한다(무한 루프·오탐 방지).
const SESSION_REFRESH_EXEMPT_PATHS = new Set<string>([
  '/api/harucut/reissue',
  '/api/harucut/login',
  '/api/harucut/register',
  '/api/auth/status',
  '/api/email-auth/code',
  '/api/email-auth/verification',
  '/api/harucut/reset/password',
  '/api/harucut/reset/password/verification',
  '/api/harucut/logout',
  '/api/harucut/exit',
]);

function isSessionRefreshExempt(path: ApiPath) {
  const key = typeof path === 'string' ? path : path.direct;
  return SESSION_REFRESH_EXEMPT_PATHS.has(key);
}

// 401로 재발급까지 실패했을 때 호출되는 세션 종료 핸들러.
// api-client는 세션 스토어를 직접 import할 수 없어(순환 참조) 레지스트리로 위임받는다.
let onSessionExpired: (() => void) | null = null;

export function registerSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

// 쿠키 기반 액세스 토큰 재발급(요청 본문 없음). 자체 401 재시도는 건너뛴다.
async function reissueAccessToken() {
  await apiRequest('/api/harucut/reissue', { method: 'POST', skipAuthRefresh: true });
}

export async function apiRequest<T>(path: ApiPath, options: RequestOptions = {}) {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl}${resolvePath(path)}`;
  const hasBody = options.body !== undefined;

  const performFetch = () => {
    const headers = new Headers(options.headers);
    headers.set('Accept', headers.get('Accept') ?? 'application/json');

    if (hasBody && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(url, {
      body: hasBody ? JSON.stringify(options.body) : undefined,
      cache: options.cache,
      credentials: 'include',
      headers,
      method: options.method ?? 'GET',
      signal: options.signal,
    });
  };

  let response = await performFetch();

  // 액세스 토큰 만료(401)면 쿠키 기반으로 1회 재발급한 뒤 원요청을 재시도한다.
  // 재발급까지 실패하면(여전히 401) 세션이 끊긴 것으로 보고 등록된 종료 핸들러를 호출한다.
  if (
    response.status === 401 &&
    !options.skipAuthRefresh &&
    !isSessionRefreshExempt(path)
  ) {
    try {
      await reissueAccessToken();
      response = await performFetch();
    } catch {
      // 재발급 실패 — 아래 401 분기에서 에러를 던지고 세션 종료를 알린다.
    }

    if (response.status === 401) {
      onSessionExpired?.();
    }
  }

  const text = await response.text();
  let data = null as T;

  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as T;
    }
  }

  if (!response.ok) {
    const envelope = extractEnvelopeLike(data);
    throw new ApiRequestError<T>({
      apiMessage: envelope?.message,
      code: envelope?.code,
      data,
      status: response.status,
    });
  }

  return data;
}

export async function apiEnvelopeData<T>(path: ApiPath, options: RequestOptions = {}) {
  const envelope = await apiRequest<ApiEnvelope<T>>(path, options);
  return envelope.data;
}
