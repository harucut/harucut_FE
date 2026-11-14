/**
 * 합성 실패 코드(app-shell-backend-requests §8). 서버는 FAILED 일 때만 `failureCode` 를 준다(코드 도입 전 실패는 키 없음).
 * `failureReason` 은 진단용이라 화면에 쓰지 않는다 — 이 코드만 문구로 옮긴다.
 *
 * 합성 Lambda 가 배포되기 전에는 운영 실패가 TIMED_OUT 아니면 UNKNOWN 만 나온다. 그래서 모르는 값·UNKNOWN·키 없음은
 * 모두 기본 문구다.
 *
 * 다시 해서 풀리는 실패는 다시 시도로 둔다(2026-11-15 「서버가 네컷을 완성하지 못했어요는 뭐야 그럼 다시 시도해야지 /
 * 완성되어야 넘어가도록」). 다시 시도는 새 작업이고(newJobOnRetry) 원본은 기기에 있는 사진을 다시 올린다 — 그래서
 * 서버가 원본을 잃었거나(SOURCE_*) 재접수가 바닥난(DISPATCH_EXHAUSTED) 실패도 「다시 찍어 주세요」가 아니다.
 * 이 표에는 문구가 따로 필요한 것만 둔다 — 나머지는 기본 문구(다시 시도)다.
 */
export type ComposeFailureCode =
  | "SOURCE_MISSING"
  | "SOURCE_UNREADABLE"
  | "ASSET_MISSING"
  | "ASSET_UNREADABLE"
  | "TIMED_OUT"
  | "RENDER_FAILED"
  /** 결과·썸네일 쌍이 검증되지 않아 공개하지 않은 최종 실패(D09). 서버 출력 계약 2 이후에만 나온다. RENDER_FAILED 와 같은 기본 문구다. */
  | "OUTPUT_CONFLICT"
  /** 앱 재접수 횟수·총 기한을 넘긴 일시 장애. 최종 실패라 원본이 지워지므로 다시 찍어야 한다. */
  | "DISPATCH_EXHAUSTED"
  | "UNKNOWN";

type FailureCopy = {
  message: string;
  /** 같은 입력으로 다시 시도해 풀릴 수 있는가. 원본·자산 문제는 같은 요청을 되풀이해도 결과가 같다. */
  retryable: boolean;
};

const COPY: Partial<Record<ComposeFailureCode, FailureCopy>> = {
  // 프레임 파일이 없거나 깨졌다. 같은 프레임으로는 몇 번을 해도 같다 — 이것만 프레임을 다시 고르게 한다.
  ASSET_MISSING: { message: "프레임을 불러오지 못했어요. 다른 프레임으로 시도해 주세요.", retryable: false },
  ASSET_UNREADABLE: { message: "프레임을 불러오지 못했어요. 다른 프레임으로 시도해 주세요.", retryable: false },
  TIMED_OUT: { message: "사진을 만드는 데 시간이 너무 걸렸어요. 다시 시도해 주세요.", retryable: true },
};

/** 문구가 따로 없으면 null — 부른 쪽이 기본 문구(다시 시도)를 쓴다. */
export function composeFailureCopy(code: unknown): FailureCopy | null {
  return (typeof code === "string" && COPY[code as ComposeFailureCode]) || null;
}
