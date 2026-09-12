import type { UserInfo } from "@/lib/api-types";

export type PlanTier = "BASIC" | "PLUS" | "PRO";

export type PlanInfo = {
  name: PlanTier;
  /** 저장 가능한 프레임 개수 */
  limit: number;
  /** 상위 요금제 이름 (PRO는 없음) */
  next: PlanTier | null;
  /** 상위 요금제의 저장 한도 */
  nextLimit: number | null;
};

// 요금제별 커스텀 프레임 보관 한도. 무료(BASIC) 0 · 베이직(PLUS) 3 · 프로(PRO) 무제한.
// 서버 `frameRetentionLimit` 과 같은 값이며(무제한을 서버는 -1, 여기서는 Infinity 로 쓴다),
// 구독 사용량 조회를 못 받을 때의 폴백이다.
// PRO 는 가격표에서 내렸지만 쿠폰으로 받은 사용자가 있어 한도 계산은 그대로 남긴다.
export const PLAN_FRAME_LIMITS: Record<PlanTier, number> = {
  BASIC: 0,
  PLUS: 3,
  PRO: Number.POSITIVE_INFINITY,
};

// 요금제별 기록(미디어) 보관 기간. 서버가 이 기간을 넘긴 기록을 목록에서 아예 잘라 내려주므로
// (PlanTier.historyRetention), 화면에서 "기록이 없다"와 "기간이 지났다"를 구분하려면 이 값이 필요하다.
export const PLAN_HISTORY_RETENTION_LABELS: Record<PlanTier, string> = {
  BASIC: "최근 3일",
  PLUS: "최근 3개월",
  PRO: "무제한",
};

const PLAN_ORDER: PlanTier[] = ["BASIC", "PLUS", "PRO"];

/** 게이지에 그리는 점 최대 개수(유한 표시용 상한). PRO는 무제한이라 한도와 분리해 고정한다. */
export const MAX_GAUGE_DOTS = 6;

/**
 * 사용자 요금제(tier)로 보관 한도/상위 요금제 정보를 만든다.
 * tier가 없으면(미로그인·미제공) BASIC 기본값으로 처리한다.
 */
export function resolvePlanInfo(tier: UserInfo["planTier"] | undefined): PlanInfo {
  const name: PlanTier =
    tier === "PLUS" || tier === "PRO" || tier === "BASIC" ? tier : "BASIC";
  const idx = PLAN_ORDER.indexOf(name);
  const next = idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;

  return {
    name,
    limit: PLAN_FRAME_LIMITS[name],
    next,
    nextLimit: next ? PLAN_FRAME_LIMITS[next] : null,
  };
}

export type GaugeDotState = "filled" | "empty" | "locked";

/**
 * 저장 개수(used)와 한도(limit)로 슬롯 게이지 점 상태 배열을 만든다.
 * - i < used   → filled (채움)
 * - i < limit  → empty  (현재 요금제 빈 슬롯)
 * - 그 외      → locked (상위 요금제에서 열리는 잠금 슬롯)
 */
export function buildGaugeDots(used: number, limit: number): GaugeDotState[] {
  return Array.from({ length: MAX_GAUGE_DOTS }, (_, i) =>
    i < used ? "filled" : i < limit ? "empty" : "locked",
  );
}
