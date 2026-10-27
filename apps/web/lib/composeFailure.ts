/**
 * 합성 실패 코드(app-shell-backend-requests §8). 서버는 FAILED 일 때만 `failureCode` 를 준다(코드 도입 전 실패는 키 없음).
 * `failureReason` 은 진단용이라 화면에 쓰지 않는다 — 이 코드만 문구로 옮긴다.
 *
 * 합성 Lambda 가 배포되기 전에는 운영 실패가 TIMED_OUT 아니면 UNKNOWN 만 나온다. 그래서 모르는 값·UNKNOWN·키 없음은
 * 모두 기본 문구다.
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
  | "UNKNOWN";

type FailureCopy = {
  message: string;
  /** 같은 입력으로 다시 시도해 풀릴 수 있는가. 원본·자산 문제는 같은 요청을 되풀이해도 결과가 같다. */
  retryable: boolean;
};

const COPY: Record<Exclude<ComposeFailureCode, "UNKNOWN" | "RENDER_FAILED" | "OUTPUT_CONFLICT">, FailureCopy> = {
  SOURCE_MISSING: { message: "사진을 찾을 수 없어요. 다시 찍어 주세요.", retryable: false },
  SOURCE_UNREADABLE: { message: "사진 파일을 읽지 못했어요. 다시 찍어 주세요.", retryable: false },
  ASSET_MISSING: { message: "프레임을 불러오지 못했어요. 다른 프레임으로 시도해 주세요.", retryable: false },
  ASSET_UNREADABLE: { message: "프레임을 불러오지 못했어요. 다른 프레임으로 시도해 주세요.", retryable: false },
  TIMED_OUT: { message: "사진을 만드는 데 시간이 너무 걸렸어요. 다시 시도해 주세요.", retryable: true },
};

/** 코드가 없거나 모르면 null — 부른 쪽이 지금까지의 기본 문구를 쓴다. */
export function composeFailureCopy(code: unknown): FailureCopy | null {
  return typeof code === "string" && code in COPY ? COPY[code as keyof typeof COPY] : null;
}
