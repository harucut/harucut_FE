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
