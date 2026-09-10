"use client";

import {
  CLIENT_NETWORK_UNREACHABLE_CODE,
  CLIENT_REISSUE_UNAVAILABLE_CODE,
} from "@harucut/shared";

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

// 탈퇴요청(DELETED_REQUESTED) 상태로 판정됐을 때 호출되는 핸들러.
// 세션 만료와 **다르다** — 토큰은 멀쩡하고 계정 상태만 막힌 것이라 로그아웃시키면 안 된다.
let onDeletionRequested: (() => void) | null = null;

export function registerDeletionRequestedHandler(handler: (() => void) | null) {
  onDeletionRequested = handler;
}

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

/**
 * 서버가 탈퇴요청 계정의 일반 API 를 막을 때 쓰는 코드.
 * 인가 거부는 전부 이 코드 하나로 오므로(GEN-021 = "Access denied."), 이것만으로는
 * 탈퇴요청인지 알 수 없다. 그래서 /api/auth/status 로 상태를 한 번 더 확인한다.
 */
const ACCESS_DENIED_CODE = "GEN-021";

// 상태 조회 자체와 탈퇴 취소는 이 검사에서 빼야 한다(자기 자신을 다시 부르는 순환 방지).
const DELETION_CHECK_EXEMPT_PATHS = new Set<string>([
  "/api/auth/status",
  "/api/auth/session",
  "/api/client/reactivate",
  "/api/client/logout",
]);

/**
 * 403 GEN-021 을 받았을 때 정말 탈퇴요청 상태인지 확인한다.
 *
 * 맞으면 등록된 핸들러(복구 안내로 유도)를 부른다. **로그아웃시키지 않는다** — 토큰은 여전히
 * 유효하고, /api/auth/status 와 탈퇴 취소는 이 상태에서도 열려 있어서 복구 진입로가 살아 있다.
 * 상태 조회가 실패하면 아무것도 하지 않는다 — 단순 권한 부족을 탈퇴요청으로 오인하지 않기 위해서다.
 */
async function checkDeletionRequested() {
  try {
    const res = await fetch("/api/auth/status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;

    const body = (await res.json()) as { data?: { userStatus?: unknown } };
    if (body?.data?.userStatus === "DELETED_REQUESTED") {
      onDeletionRequested?.();
    }
  } catch {
    // 네트워크 오류면 판단을 보류한다.
  }
}

/**
 * 공유 재발급의 **자체 종료 상한.**
 *
 * 호출부의 상한과 별개로 필요하다. 재발급을 탭에 하나로 묶어 놓았으므로(아래
 * `pendingReissue`), 상한 없는 호출부가 먼저 붙은 채 왕복이 멈추면 기다리는 쪽이 영영
 * 정리되지 않고 **회선이 돌아온 뒤의 모든 401 이 그 멈춘 약속만 기다린다** — 새로고침
 * 전까지 인증 API 가 통째로 선다. `resolveMembership()` 과 `useMyFrames()` 가 정확히
 * 그 「상한 없는 호출부」다.
 *
 * 숫자는 **실측이 아니다.** 재발급 응답 시간을 재 보지 않았고, 이 저장소가 같은 성격의
 * 문제(안 끝나면 사용자가 갇힌다)에 이미 걸어 둔 상한과 맞췄다 —
 * `lib/userMediaApi.ts` 의 `DELETE_DEADLINE_MS`, `lib/themeEditorStore.ts` 의
 * `ASSET_QUEUE_WAIT_LIMIT_MS` 가 둘 다 30초다. 셋이 갈라지면 근거가 사라지니 함께 본다.
 */
const REISSUE_DEADLINE_MS = 30_000;

// 쿠키 기반 액세스 토큰 재발급. 자체 401 재시도는 하지 않는다(exempt).
async function requestReissue(): Promise<ReissueResult> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REISSUE_DEADLINE_MS);

  try {
    const res = await fetch("/api/client/reissue", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.ok) return "ok";
    return res.status === 401 || res.status === 403 ? "expired" : "unavailable";
  } catch {
    // 상한에 걸린 것도, 회선이 끊긴 것도 여기다. 둘 다 「재발급 못 했다」로 접는다 —
    // 세션이 끊겼다고 단정하지 않는다(그 판정은 서버가 401·403 으로 준 때뿐이다).
    return "unavailable";
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * 지금 도는 재발급. **탭에 하나뿐이다.**
 *
 * 왜 하나여야 하는가 — `reissue` 는 **refresh 를 회전시킨다.** 같은 쿠키로 둘이 동시에
 * 부르면 서버가 둘 다 받아 회전 응답 순서에 따라 한쪽이 무효가 되고, 그쪽 호출부는 멀쩡한
 * 세션을 끊긴 것으로 읽는다. 실제로 나던 자리: 행사 주소로 들어온 회원에게 프레임 조회
 * (`useMyFrames`)와 회원 판정(`resolveMembership`)이 나란히 시작되고, access 가 만료돼
 * 있으면 둘 다 401 을 받아 재발급이 두 번 나갔다. 판정 쪽이 진 경우 회원이 `guest` 로
 * 읽혀 7일짜리 체험 쿠키가 심겼다.
 */
let pendingReissue: Promise<ReissueResult> | null = null;

/** 이 signal 이 끊기면 「재발급 못 했다」로 답한다 — 기다리기를 그만두는 자리다. */
function abortedAsUnavailable(signal: AbortSignal): Promise<ReissueResult> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("unavailable");
      return;
    }
    signal.addEventListener("abort", () => resolve("unavailable"), {
      once: true,
    });
  });
}

/**
 * 재발급을 부른다 — 이미 도는 것이 있으면 **그것을 기다린다.**
 *
 * 왕복 자체에는 호출부의 signal 을 걸지 않는다. 먼저 온 호출부가 자기 상한으로 끊으면
 * 뒤에 붙은 호출부의 재발급까지 함께 죽기 때문이다. 대신 **기다리는 쪽**에 signal 을 건다 —
 * 끊긴 호출부는 `unavailable` 을 받아 자기 실패로 넘어가고(그러면 `resolveMembership` 은
 * `guest` 가 아니라 `unknown` 으로 답한다), 왕복은 남은 호출부를 위해 계속 간다.
 *
 * **슬롯은 왕복이 실제로 끝날 때까지 쥔다.** 한때 「기다리는 쪽이 다 떠나면 놓는다」로
 * 두었는데, 그러면 호출부의 상한(30초)이 왕복의 상한(같은 30초)보다 조금이라도 먼저 끊길
 * 때 슬롯이 먼저 비고 **아직 도는 왕복과 새 왕복이 나란히** 돌았다 — 같은 refresh 쿠키로
 * 회전 두 개, 곧 이 단일화가 막으려던 그 경쟁이다. 멈춘 왕복이 탭을 영영 막는 문제는
 * 이제 왕복 자체의 상한(`REISSUE_DEADLINE_MS`)이 맡는다.
 */
function reissueAccessToken(signal?: AbortSignal): Promise<ReissueResult> {
  if (!pendingReissue) {
    pendingReissue = requestReissue().finally(() => {
      pendingReissue = null;
    });
  }

  const shared = pendingReissue;
  return signal ? Promise.race([shared, abortedAsUnavailable(signal)]) : shared;
}

/**
 * 취소된 요청인지. AbortController.abort() 로 끊긴 fetch 는 name 이 "AbortError" 인
 * DOMException 을 던진다. 그 클래스는 환경마다 달라서(브라우저 · jsdom · node) instanceof 로
 * 보면 한 곳에서만 맞는다 — name 으로 본다.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
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

  // fetch 가 응답 없이 던지는 구간 — 진짜 오프라인, DNS 실패, Next 서버 자체가 죽음.
  // 응답이 없으니 봉투도 code 도 없고, 그대로 두면 TypeError 가 화면까지 올라간다.
  // 호출부는 ApiRequestError 만 읽으므로 원인을 못 알아보고 화면별 폴백 문구만 띄우게 된다.
  // 프록시가 붙이는 CLIENT-003(Next→백엔드 불통)의 한 칸 앞이라 여기서 코드를 붙여
  // 같은 문법의 오류로 만든다(문구는 packages/shared/src/api-error-messages.ts).
  const doFetch = async () => {
    try {
      return await fetch(path, {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        credentials: "include",
        cache: options.cache,
        signal: options.signal,
      });
    } catch (error) {
      // 취소는 실패가 아니다. 코드를 붙이면 사용자가 스스로 끊은 요청이 오류 문구로 바뀌고,
      // name 으로 취소를 가려내던 호출부도 같이 깨진다. 그대로 던진다.
      if (isAbortError(error)) throw error;

      // status 를 만들지 않는다 — 응답이 없었으므로 HTTP 상태가 존재하지 않는다.
      // 없는 상태를 지어내면 상태로 갈래를 타는 호출부가 오지 않은 응답을 본 것처럼 군다.
      throw new ApiRequestError({
        code: CLIENT_NETWORK_UNREACHABLE_CODE,
        apiMessage: null,
      });
    }
  };

  let res = await doFetch();

  // 액세스 토큰 만료(401)면 쿠키 기반으로 1회 재발급 후 원요청을 재시도한다.
  // 재발급까지 실패하면(여전히 401) 세션이 끊긴 것으로 보고 등록된 만료 핸들러를 호출한다.
  if (res.status === 401 && !SESSION_REFRESH_EXEMPT_PATHS.has(path)) {
    const reissue = await reissueAccessToken(options.signal);
    // 재발급 성공 시에만 재시도한다. 재시도 fetch 가 실패하면 그 오류를 그대로 올려
    // 유효 세션을 만료로 오인하지 않는다(취소면 AbortError, 회선이 끊겼으면 CLIENT-004).
    // 재발급 실패면 최초 401 응답을 유지한다.
    if (reissue === "ok") {
      res = await doFetch();
    }

    // 재발급 서버가 일시적으로 못 답한 경우(unavailable)는 세션 만료로 단정하지 않는다.
    // 최초 401을 그대로 올리면 화면이 AUTH-012를 읽어 "로그인이 만료됐어요"를 띄우므로,
    // 세션이 멀쩡한 사용자가 재로그인하게 된다. 재시도 가능한 오류로 바꿔 던진다.
    if (res.status === 401 && reissue === "unavailable") {
      throw new ApiRequestError({
        status: 503,
        code: CLIENT_REISSUE_UNAVAILABLE_CODE,
        apiMessage: null,
      });
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

    // 탈퇴요청 계정은 일반 API 가 전부 403 GEN-021 이 된다. 화면마다 따로 처리하는 대신
    // 여기서 한 번 확인하고 복구 안내로 넘긴다. 에러는 그대로 던져 기존 처리도 살려 둔다.
    if (
      res.status === 403 &&
      envelope?.code === ACCESS_DENIED_CODE &&
      !DELETION_CHECK_EXEMPT_PATHS.has(path)
    ) {
      void checkDeletionRequested();
    }

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
