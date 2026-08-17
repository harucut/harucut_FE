"use client";

import { clientApi } from "@/lib/clientApi";
import { getApiErrorDetails } from "@/lib/apiError";
import type { ApiEnvelope } from "@/lib/api-types";

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
 *        { frameId, sourceKeys[4], idempotencyKey }
 *   GET  /api/auth/user/media/compose/{id} → 200 { jobId, status, mediaId?, failureReason? }
 *
 * `status` 는 PENDING · DONE · FAILED 셋뿐이다. RUNNING 이 없는 것은 의도된 설계다 —
 * 재실행 판정을 "오래된 PENDING"으로 하기 때문에 몇 초짜리 실행 상태를 따로 두지 않는다.
 *
 * 원본 키는 **내 S3 루트 아래**여야 한다(서버가 prefix 를 검사해 남의 키를 막는다).
 * 합성이 성공하면 서버가 원본 4장을 지운다 — 결과만 보관함에 남는다.
 *
 * ## 아직 배포되지 않았다
 *
 * 이 엔드포인트는 백엔드 저장소 main 에는 있지만 배포본에는 없다(실측: 배포본에서 404 GEN-031,
 * 존재하지 않는 경로와 같은 응답). 그래서 `isComposeUnavailable()` 로 404 를 구분해
 * 호출부가 기존 클라이언트 합성으로 되돌아갈 수 있게 한다.
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
};

/** 이 백엔드에 서버 합성이 아직 없는가(404). 다른 실패와 구분해 폴백 판단에 쓴다. */
export function isComposeUnavailable(error: unknown) {
  return getApiErrorDetails(error).status === 404;
}

export async function requestCompose(body: ComposeRequest): Promise<ComposeJob> {
  const res = await clientApi.post<ApiEnvelope<ComposeJob>>(
    "/api/client/user/media/compose",
    body,
  );
  return res.data.data;
}

export async function getComposeJob(jobId: number): Promise<ComposeJob> {
  const res = await clientApi.get<ApiEnvelope<ComposeJob>>(
    `/api/client/user/media/compose/${jobId}`,
  );
  return res.data.data;
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
  /** 이 시간을 넘기면 ComposeTimeoutError. */
  timeoutMs?: number;
  /** 진행 상황을 화면에 보여줄 때 쓴다. */
  onTick?: (job: ComposeJob, elapsedMs: number) => void;
  signal?: AbortSignal;
};

/**
 * DONE 이 될 때까지 기다린다.
 *
 * 로컬 실측에서는 2초 안에 끝났지만(원본 4장, GRID 4000×6000), 서버가 Lambda 로 돌면
 * 콜드스타트가 붙는다. 기본 상한을 넉넉히 두되 무한정 기다리지는 않는다 —
 * 사용자가 빈 화면을 보고 있는 시간이라 실패로 끝내는 편이 낫다.
 */
export async function waitForCompose(
  jobId: number,
  { intervalMs = 1000, timeoutMs = 90_000, onTick, signal }: WaitOptions = {},
): Promise<ComposeJob> {
  const startedAt = Date.now();

  for (;;) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const job = await getComposeJob(jobId);
    const elapsed = Date.now() - startedAt;
    onTick?.(job, elapsed);

    if (job.status === "DONE") return job;
    if (job.status === "FAILED") throw new ComposeFailedError(job.failureReason);
    if (elapsed >= timeoutMs) throw new ComposeTimeoutError();

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
