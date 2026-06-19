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
};

const DEFAULT_API_BASE_URL = 'https://api.harucut.com';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

// localhost / 안드로이드 에뮬레이터 전용 호스트인지 판별한다.
function isLocalDevHost(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/i.test(value.trim());
}

function configuredApiBaseUrl() {
  // 릴리즈 빌드(__DEV__ === false)에서는 개발 전용 localhost 값을 신뢰하지 않고 운영 API로
  // 폴백한다. env가 주입되지 않은 standalone 빌드가 app.json의 localhost 값을 채택해 모든
  // 요청이 localhost로 향하고 "Network request failed"가 나던 문제를 코드 레벨에서도 막는다.
  const acceptable = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return undefined;
    if (!__DEV__ && isLocalDevHost(trimmed)) return undefined;
    return trimmed;
  };

  const fromEnv = acceptable(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (fromEnv) return fromEnv;

  const fromExtra =
    typeof Constants.expoConfig?.extra?.apiBaseUrl === 'string'
      ? acceptable(Constants.expoConfig?.extra?.apiBaseUrl)
      : undefined;
  if (fromExtra) return fromExtra;

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

export async function apiRequest<T>(path: ApiPath, options: RequestOptions = {}) {
  const { baseUrl } = getApiConfig();
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined;

  headers.set('Accept', headers.get('Accept') ?? 'application/json');

  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${resolvePath(path)}`, {
    body: hasBody ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    credentials: 'include',
    headers,
    method: options.method ?? 'GET',
    signal: options.signal,
  });

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
