// 하루컷 요금제 — 화면에 쓰는 형태.
//
// **사실(가격·피처 표·Enterprise 안내)은 여기 있지 않다.** packages/shared/src/plans.ts 가
// 단일 소스이고, 웹과 앱이 그걸 함께 읽는다. 예전에는 두 곳이 같은 표를 각자 하드코딩하고
// "값 변경 시 함께 맞춘다"는 주석만 달아 뒀는데, 그 약속이 지켜지지 않아 웹에서 걷어낸
// 거짓 표시가 앱에 그대로 남았다. 사람이 지키는 규칙 대신 한 곳에서 읽게 했다.
//
// 여기서 더하는 것은 화면용 문구뿐이다(카드 CTA 라벨 등).
import {
  ENTERPRISE_FACTS,
  PLAN_FACTS,
  PLAN_NAMES,
  toPlanId as toPlanIdShared,
  type PlanFacts,
  type PlanFeature as SharedPlanFeature,
  type PlanId as SharedPlanId,
} from "@harucut/shared";

export type PlanId = SharedPlanId;
export type PlanFeature = SharedPlanFeature;

export type Plan = PlanFacts & {
  /** 카드 버튼에 쓰는 라벨. 결제가 닫혀 있으면 PricingView 가 상태 표시로 갈아친다. */
  cta: string;
  badge?: string;
};

const CTA_BY_ID: Record<PlanId, string> = {
  basic: "무료로 시작하기",
  plus: "베이직 시작하기",
  // 가격표에 카드가 없어 실제로 쓰이지 않지만, PlanId 를 모두 채워 둬야
  // 나중에 PRO 카드를 되살릴 때 라벨이 빠진 채로 나가지 않는다.
  pro: "프로 시작하기",
};

export const PLANS: Plan[] = PLAN_FACTS.map((plan) => ({
  ...plan,
  cta: CTA_BY_ID[plan.id],
}));

export const ENTERPRISE_TEASER = ENTERPRISE_FACTS;

export const toPlanId = toPlanIdShared;

// 서버 등급을 사람이 읽는 이름(무료/베이직/프로)으로 바꾼다. 모르는 값이면 null.
//
// PLANS 에서 찾지 않는다 — PRO 는 가격표에 카드가 없어서 못 찾고, 그러면 마이페이지가
// PRO 사용자에게 "무료"라고 말한다(호출부의 ?? "무료" 폴백에 걸린다).
export function getPlanDisplayName(tier: string | null | undefined): string | null {
  const id = toPlanId(tier);
  return id ? PLAN_NAMES[id] : null;
}

// 요금제 페이지 헤더 카피. 로그인 후에는 "비회원" 안내가 의미 없어 문장을 바꾼다.
export const PRICING_HEADLINE = "나에게 맞는 플랜";
// 보정은 플랜과 무관하게 모두 되므로(서버에 등급 개념이 없다) 문구에서 뺀다.
export const PRICING_SUBTITLE =
  "비회원도 촬영은 무료예요. 커스텀 프레임과 보관 기간이 플랜에 따라 달라요.";
export const PRICING_SUBTITLE_AUTHED =
  "커스텀 프레임과 보관 기간이 플랜에 따라 달라요. 결제 기능은 준비 중이에요.";
// 결제 미오픈 안내 — 요금제 카드 CTA·footnote가 함께 쓴다.
export const PRICING_BILLING_PENDING = "결제 기능은 준비 중이에요.";
// 요금제를 내릴 때의 안내(비활성화 정책).
export const PRICING_DOWNGRADE_NOTE =
  "요금제를 내리면 하위 플랜의 보관 기간·개수까지만 유지되고, 초과분은 삭제되지 않고 비활성화돼요.";
