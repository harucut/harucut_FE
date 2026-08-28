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

export async function getComposeJob(jobId: number): Promise<ComposeJob> {
  const res = await clientApi.get<ApiEnvelope<ComposeJob>>(
    `/api/client/user/media/compose/${jobId}`,
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
