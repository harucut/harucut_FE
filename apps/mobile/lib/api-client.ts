import { getApiErrorMessageByCode, getPlanErrorMessage } from '@harucut/shared';
import Constants from 'expo-constants';

export type ApiEnvelope<T> = {
  code?: string;
  data: T;
  message?: string | null;
  status?: number;
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

// 앱은 백엔드를 직접 호출한다. 네이티브 쿠키 저장소가 credentials: 'include'를 처리하므로
// 웹 BFF(apps/web의 /api/client/*)를 경유할 이유가 없다. 브라우저용 제품은 apps/web이 맡는다.
export function getApiConfig() {
  return {
    baseUrl: trimTrailingSlash(configuredApiBaseUrl()),
  };
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
  if (error instanceof ApiRequestError) {
    // 백엔드 ErrorCode 메시지는 전부 영문이라 그대로 노출하지 않는다. 코드로 우리 문구를 찾는다.
    const planMessage = getPlanErrorMessage(error.code);
    if (planMessage) {
      return planMessage;
    }

    // 검증 실패(400 GEN-003)만 data[]에 필드별 한국어 사유가 온다.
    const fieldMessage = Array.isArray(error.data)
      ? (error.data as Array<{ message?: unknown }>).find(
          (item) => typeof item?.message === 'string' && item.message.trim(),
        )?.message
      : null;
    if (typeof fieldMessage === 'string' && fieldMessage.trim()) {
      return fieldMessage.trim();
    }

    const mapped = getApiErrorMessageByCode(error.code);
    if (mapped) {
      return mapped;
    }

    if (__DEV__ && error.apiMessage) {
      console.error(`[api] 미매핑 에러 code=${error.code ?? '?'} message=${error.apiMessage}`);
    }

    return fallback;
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
  '/api/email-auth/code',
  '/api/email-auth/verification',
  '/api/harucut/reset/password',
  '/api/harucut/reset/password/code',
  '/api/harucut/reset/password/verification',
  '/api/harucut/logout',
]);
// 참고: /api/auth/status 와 /api/harucut/exit 는 의도적으로 예외에서 제외한다.
// 둘 다 보호 API라, 액세스 토큰만 만료되고 refresh 쿠키는 유효한 상황의 401에서는
// 재발급 후 재시도되어야 한다. status를 예외로 두면 콜드스타트 세션 복원이 토큰을 갱신하지
// 못해 로그인된 사용자가 공개 화면에 머물고, exit를 예외로 두면 탈퇴 요청이 바로 401로
// 실패해 계정 탈퇴를 진행할 수 없다.

function isSessionRefreshExempt(path: string) {
  return SESSION_REFRESH_EXEMPT_PATHS.has(path);
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

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl}${path}`;
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
    let reissued = false;
    try {
      await reissueAccessToken();
      reissued = true;
    } catch {
      // 재발급 실패 — 세션이 끊긴 것으로 보고 아래 401 분기에서 종료를 알린다.
    }

    // 재발급에 성공했을 때만 원요청을 재시도한다. 재시도 fetch의 오류(AbortSignal 취소,
    // 일시적 네트워크 오류 등)는 삼키지 않고 그대로 전파해, 유효한 회원 세션을 세션 만료로
    // 오인해 로그아웃시키지 않는다. 재발급 자체가 실패한 경우에는 기존 401 응답이 유지되어
    // 아래 분기에서 세션 종료를 알린다.
    if (reissued) {
      response = await performFetch();
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

export async function apiEnvelopeData<T>(path: string, options: RequestOptions = {}) {
  const envelope = await apiRequest<ApiEnvelope<T>>(path, options);
  return envelope.data;
}
