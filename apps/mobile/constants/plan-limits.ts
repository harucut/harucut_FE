export type PlanTier = 'BASIC' | 'PLUS' | 'PRO';

export type PlanInfo = {
  /** 상위 요금제 보관 한도 */
  limit: number;
  name: PlanTier;
  /** 상위 요금제 이름 (PRO는 없음) */
  next: PlanTier | null;
  /** 상위 요금제의 저장 한도 */
  nextLimit: number | null;
};

// 요금제별 프레임 보관 한도. BASIC 1 · PLUS 5 · PRO 10
export const PLAN_FRAME_LIMITS: Record<PlanTier, number> = {
  BASIC: 1,
  PLUS: 5,
  PRO: 10,
};

const PLAN_ORDER: PlanTier[] = ['BASIC', 'PLUS', 'PRO'];

/** 게이지에 그리는 점 최대 개수(최상위 요금제 한도) */
export const MAX_GAUGE_DOTS = PLAN_FRAME_LIMITS.PRO;

export type GaugeDotState = 'filled' | 'empty' | 'locked';

/**
 * 사용자 요금제(tier)로 보관 한도/상위 요금제 정보를 만든다.
 * tier가 없으면(미제공) BASIC 기본값으로 처리한다.
 */
export function resolvePlanInfo(tier: string | null | undefined): PlanInfo {
  const name: PlanTier =
    tier === 'PLUS' || tier === 'PRO' || tier === 'BASIC' ? tier : 'BASIC';
  const idx = PLAN_ORDER.indexOf(name);
  const next = idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;

  return {
    limit: PLAN_FRAME_LIMITS[name],
    name,
    next,
    nextLimit: next ? PLAN_FRAME_LIMITS[next] : null,
  };
}

/**
 * 저장 개수(used)와 한도(limit)로 슬롯 게이지 점 상태 배열을 만든다.
 * - i < used   → filled (채움)
 * - i < limit  → empty  (현재 요금제 빈 슬롯)
 * - 그 외      → locked (상위 요금제에서 열리는 잠금 슬롯)
 */
export function buildGaugeDots(used: number, limit: number): GaugeDotState[] {
  return Array.from({ length: MAX_GAUGE_DOTS }, (_, i) =>
    i < used ? 'filled' : i < limit ? 'empty' : 'locked',
  );
}
