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

// 요금제별 커스텀 프레임 보관 한도(가격표 기준). Free 0 · Plus 3 · Pro 무제한.
// 서버 구독 사용량을 못 받을 때의 폴백 기본값이며, 무제한은 Infinity로 표현한다.
export const PLAN_FRAME_LIMITS: Record<PlanTier, number> = {
  BASIC: 0,
  PLUS: 3,
  PRO: Number.POSITIVE_INFINITY,
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
