"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 네컷 서버 합성.
 *
 * 지금까지는 완성본을 브라우저 캔버스가 만들었다(lib/canvas/composeFrame.ts). 서버 합성은
 * 고른 원본 4장을 올려 두고 서버가 그리게 한다 — 결과 해상도가 기기와 무관해지고,
 * 결과물이 blob 이 아니라 https URL 이 되어 공유·앱 저장으로 이어진다.
 *
 * ## 계약 (로컬 백엔드로 실측)
 *
 *   POST /api/auth/user/media/compose      → 202 { jobId, status: "PENDING" }
 *        { frameId, sourceKeys[4], idempotencyKey, backgroundColor? }
 *   GET  /api/auth/user/media/compose/{id} → 200 { jobId, status, mediaId?, failureReason? }
 *
 * `status` 는 PENDING · DONE · FAILED 셋뿐이다. RUNNING 이 없는 것은 의도된 설계다 —
 * 재실행 판정을 "오래된 PENDING"으로 하기 때문에 몇 초짜리 실행 상태를 따로 두지 않는다.
 *
 * 원본 키는 **내 S3 루트 아래**여야 한다(서버가 prefix 를 검사해 남의 키를 막는다).
 * 합성이 성공하면 서버가 원본 4장을 지운다 — 결과만 보관함에 남는다.
 *
 * ## 404 를 "기능 없음"으로 읽지 말 것
 *
 * 예전 주석은 이 엔드포인트가 배포본에 없다고 적어 두고 404 를 폴백 신호로 썼다.
 * 지금은 살아 있고, 404(GEN-031)는 **"없는 프레임이거나 남의 프레임"**이라는 정상 도메인
 * 에러다. 폴백 신호로 쓰면 프레임 지정 실수를 "서버에 기능이 없다"로 오독하게 된다.
 * 게다가 되돌아갈 곳도 없어졌다 — 완성본을 등록하던 API 가 사라졌다(405).
 */

export type ComposeStatus = "PENDING" | "DONE" | "FAILED";

export type ComposeJob = {
  jobId: number;
  status: ComposeStatus;
  /** DONE 일 때만 있다. */
  mediaId?: number | null;
  /** FAILED 일 때만 있다. */
  failureReason?: string | null;
};

export type ComposeRequest = {
  frameId: number;
  /** 촬영 순서대로 4개 — 슬롯 순서와 같다. */
  sourceKeys: string[];
  /**
   * 요청마다 새로 만드는 값. 재시도는 같은 값을 다시 보낸다 —
   * 서버가 기존 Job 을 그대로 돌려주므로 더블클릭이 두 번 그리지 않는다.
   */
  idempotencyKey: string;
  /**
   * 배경색 덮어쓰기(`#RRGGBB`). 생략하면 프레임에 저장된 배경 그대로 합성한다.
   *
   * **단색(COLOR) 배경 프레임에서만 쓸 수 있다** — 이미지 배경 프레임에 보내면 400 이다.
   *
   * ⚠️ 같은 `idempotencyKey` 로 색만 바꿔 다시 보내면 **무시된다.** 서버가 기존 작업을
   * 그대로 재생하기 때문이다. 색이 바뀌면 키도 새로 만들어야 한다
   * (그래서 호출부의 generationKey 에 색이 들어간다).
   */
  backgroundColor?: string;
};

export async function requestCompose(body: ComposeRequest): Promise<ComposeJob> {
  const res = await clientApi.post<ApiEnvelope<ComposeJob>>(
    "/api/client/user/media/compose",
    body,
  );
  return requireData(res.data, "합성 작업");
}

export async function getComposeJob(
  jobId: number,
  options?: { signal?: AbortSignal },
): Promise<ComposeJob> {
  const res = await clientApi.get<ApiEnvelope<ComposeJob>>(
    `/api/client/user/media/compose/${jobId}`,
    options,
  );
  return requireData(res.data, "합성 상태");
}

export class ComposeFailedError extends Error {
  constructor(readonly reason: string | null | undefined) {
    super(reason ?? "합성에 실패했어요.");
    this.name = "ComposeFailedError";
  }
}

export class ComposeTimeoutError extends Error {
  constructor() {
    super("합성이 예상보다 오래 걸리고 있어요.");
    this.name = "ComposeTimeoutError";
  }
}

type WaitOptions = {
  /** 폴링 간격(ms). */
  intervalMs?: number;
  /** 시작부터 이 시간을 넘기면 ComposeTimeoutError. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * **조회 한 번**에 거는 종료 상한. 아래 `timeoutMs`(작업 전체, 기본 90초)와 재는 것이 다르다 —
 * 90초는 "합성이 언제 끝나나", 이 값은 "이 왕복이 답을 주기는 하나"다.
 *
 * 없으면 안 되는 이유: `clientApi` 에는 기본 타임아웃이 없고 fetch 도 스스로 끝나지 않는다.
 * 회선이 응답 없이 멈추면 `await getComposeJob(...)` 이 영영 안 끝나고, 총 상한 검사는
 * **응답이 온 뒤에만** 도는 자리라 90초가 세어지지도 않았다. 결과 화면은 "처리 중"에 갇히고
 * 재시도 UI 도 끝내 나오지 않는다.
 *
 * 숫자는 **실측이 아니다.** 상태 조회 응답 시간을 재 보지 않았고, 이 저장소가 같은 성격의
 * 문제(안 끝나면 사용자가 갇힌다)에 이미 걸어 둔 상한과 맞췄다 — `lib/clientApi.ts` 의
 * `REISSUE_DEADLINE_MS`, `lib/userMediaApi.ts` 의 `DELETE_DEADLINE_MS`,
 * `lib/themeEditorStore.ts` 의 `ASSET_QUEUE_WAIT_LIMIT_MS` 가 모두 30초다. 넷이 갈라지면
 * 근거가 사라지니 함께 본다. 90초와 맞추지 않은 것은 그쪽이 **오래 도는 작업**(Lambda
 * 콜드스타트 포함)의 값이라, 한 번 왕복하는 GET 에는 길기 때문이다.
 *
 * 총 상한과 겹치는 방식은 **작은 쪽**이다(아래 `Math.min`). 남은 예산이 10초인데 요청에
 * 30초를 주면 90초를 약속해 놓고 110초까지 끄는 셈이 된다 — 총 상한이 사용자에게 한 약속이라
 * 그쪽이 이긴다.
 */
export const POLL_REQUEST_DEADLINE_MS = 30_000;

/**
 * 조회 한 번. **취소(사용자가 떠남)와 상한(답이 안 옴)을 구별해서** 올린다.
 *
 * 호출부 signal 과 상한을 컨트롤러 하나로 합친다(`lib/userMediaApi.ts` 의
 * AbortController + setTimeout 과 같은 모양). 합친 signal 은 `clientApi` 를 지나 fetch 까지
 * 가고, 401 재발급을 **기다리는 쪽**에도 걸린다(`clientApi` 의 `Promise.race`) — 재발급이
 * 멈춰도 여기서 매달려 있지 않는다.
 */
async function pollComposeJob(
  jobId: number,
  deadlineMs: number,
  signal: AbortSignal | undefined,
): Promise<ComposeJob> {
  const controller = new AbortController();
  let deadlineHit = false;
  const deadline = setTimeout(() => {
    deadlineHit = true;
    controller.abort();
  }, deadlineMs);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    return await getComposeJob(jobId, { signal: controller.signal });
  } catch (error) {
    /*
      상한에 걸린 것만 이름을 바꾼다. 사용자가 끊은 것은 AbortError 그대로 올린다 —
      호출부는 그 이름으로 취소를 가려내고(clientApi 의 `isAbortError` 와 같은 규약),
      `describeComposeFailure` 는 ComposeTimeoutError 만 재시도 가능으로 읽는다.
      취소를 상한으로 바꾸면 떠난 사람의 취소가 "잠시 후 다시 시도해 주세요"가 된다.

      상한이 지났으면 무슨 오류가 왔든 상한으로 접는다 — 기다린 시간은 이미 넘겼고
      결과를 모르는 것도 같다(userMediaApi 의 deleteMedia 와 같은 판단).
      둘이 같은 순간에 겹치면 취소를 앞세운다(`!signal?.aborted`). 떠난 화면에는 아무것도
      못 띄우니 그쪽 판정이 맞다 — 다만 이 겹침은 테스트로 못 박지 못했다.
    */
    if (deadlineHit && !signal?.aborted) throw new ComposeTimeoutError();
    throw error;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", relayAbort);
  }
}

/**
 * DONE 이 될 때까지 기다린다.
 *
 * 로컬 실측에서는 2초 안에 끝났지만(원본 4장, GRID 4000×6000), 서버가 Lambda 로 돌면
 * 콜드스타트가 붙는다. 기본 상한을 넉넉히 두되 무한정 기다리지는 않는다 —
 * 사용자가 빈 화면을 보고 있는 시간이라 실패로 끝내는 편이 낫다.
 *
 * 상한은 **둘**이다. 시작부터의 총 시간(`timeoutMs`)과 조회 한 번의 왕복
 * (`POLL_REQUEST_DEADLINE_MS`) — 총 시간만 두면 왕복 하나가 멈췄을 때 세어지지도 않는다.
 *
 * 상한으로 끝나도 **서버는 이미 합성을 끝냈을 수 있다.** 조회를 못 받은 것과 합성이 안 끝난
 * 것을 여기서는 구별할 방법이 없다. 그래서 이 실패는 재시도 가능으로 둔다 — 같은
 * `idempotencyKey` 로 다시 오면 서버가 같은 작업을 돌려주므로 재시도가 이미 끝난 결과를
 * 주워 온다(`ComposeRequest.idempotencyKey`).
 */
export async function waitForCompose(
  jobId: number,
  { intervalMs = 1000, timeoutMs = 90_000, signal }: WaitOptions = {},
): Promise<ComposeJob> {
  const startedAt = Date.now();

  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // 예산이 없으면 새 조회를 내지 않는다 — 아무도 안 기다리는 왕복이 된다.
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw new ComposeTimeoutError();

    /*
      **조회 하나가 멈춰도 대기 전체를 죽이지 않는다.**

      한 번 왕복에 상한을 건 이유는 「답이 안 오는 요청에 매달리지 않는다」이지 「그러면
      포기한다」가 아니다. 30초짜리 회선 멈춤 하나가 60초 남은 예산을 통째로 버리면,
      합성은 서버에서 멀쩡히 끝나 가는데 화면만 먼저 실패로 접는다.

      그래서 요청 상한은 **그 요청만** 접고 다음 바퀴로 넘긴다. 예산이 다 떨어졌을 때만
      위 검사가 `ComposeTimeoutError` 를 낸다. 사용자가 끊은 것(AbortError)은 그대로 올린다 —
      그건 더 기다릴 이유가 사라진 것이다.
    */
    let job: ComposeJob | null = null;
    try {
      job = await pollComposeJob(
        jobId,
        Math.min(remainingMs, POLL_REQUEST_DEADLINE_MS),
        signal,
      );
    } catch (error) {
      if (!(error instanceof ComposeTimeoutError)) throw error;
      // 이 바퀴만 접는다. 예산이 남았으면 위에서 다시 돈다.
    }

    const elapsed = Date.now() - startedAt;

    // 예산이 남았는지는 **위 첫 줄이** 본다. 여기서 한 번 더 보면 같은 일을 두 자리에서
    // 하게 되고, 어느 쪽이 막고 있는지 아무도 모르게 된다.
    if (!job) continue;

    if (job.status === "DONE") return job;
    if (job.status === "FAILED") throw new ComposeFailedError(job.failureReason);
    if (elapsed >= timeoutMs) throw new ComposeTimeoutError();

    // 이 기다림에는 signal 을 걸지 않았다. 남는 지연은 최대 intervalMs 하나뿐이고
    // (다음 바퀴 첫 줄이 취소를 본다), 요청은 위에서 이미 끊긴다.
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** 요청마다 새로 만드는 멱등 키. 재시도할 때는 같은 값을 다시 넘긴다. */
export function newIdempotencyKey() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // 서버 제약: 64자 이하
  return `web-${random}`.slice(0, 64);
}
