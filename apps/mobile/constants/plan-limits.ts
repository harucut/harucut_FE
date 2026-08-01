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

// 요금제별 커스텀 프레임 보관 한도(가격표 기준). Free 0 · Plus 3 · Pro 무제한.
// 서버 구독 사용량을 못 받을 때의 폴백 기본값이며, 무제한은 Infinity로 표현한다.
export const PLAN_FRAME_LIMITS: Record<PlanTier, number> = {
  BASIC: 0,
  PLUS: 3,
  PRO: Number.POSITIVE_INFINITY,
};

const PLAN_ORDER: PlanTier[] = ['BASIC', 'PLUS', 'PRO'];

// 서버 등급(BASIC/PLUS/PRO)에 대응하는 요금제 카드 이름. 서버 원문을 그대로 노출하지 않는다.
export const PLAN_DISPLAY_NAMES: Record<PlanTier, string> = {
  BASIC: 'Free',
  PLUS: 'Plus',
  PRO: 'Pro',
};

/**
 * 서버 등급을 카드 이름(Free/Plus/Pro)으로 바꾼다. 모르는 값이면 null.
 * 웹 constants/plans.ts의 getPlanDisplayName과 같은 규약을 쓴다.
 */
export function getPlanDisplayName(tier: string | null | undefined): string | null {
  const key = tier?.trim().toUpperCase();
  return key === 'BASIC' || key === 'PLUS' || key === 'PRO' ? PLAN_DISPLAY_NAMES[key] : null;
}

/** 게이지에 그리는 점 최대 개수(유한 표시용 상한). PRO는 무제한이라 한도와 분리해 고정한다. */
export const MAX_GAUGE_DOTS = 6;

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
