/**
 * 요금제 사실(fact) 단일 소스 — 웹과 앱이 같은 값을 본다.
 *
 * 왜 shared 로 올렸나: 예전에는 웹(`apps/web/constants/plans.ts`)과
 * 앱(`apps/mobile/screens/pricing-screen.tsx`)이 같은 표를 각자 하드코딩하고,
 * 파일 상단에 "값 변경 시 둘을 함께 맞춘다"는 주석만 달아 뒀다. 그 주석은 지켜지지
 * 않았다 — 웹에서 사실이 아닌 항목(사용량 근거 없는 "인기" 배지, 아직 아무도 못 쓰는
 * AI 에 붙은 체크)을 걷어냈는데 앱에는 그대로 남아, 같은 제품이 플랫폼마다 다른 말을 했다.
 * 사람이 지키기로 한 규칙 대신 한 곳에서 읽게 만든다.
 *
 * 여기 있는 것은 **사실만**이다. 화면 문구·레이아웃·CTA 처리처럼 플랫폼마다 다른 것은
 * 각 앱에 남긴다.
 */

export type PlanId = 'basic' | 'plus' | 'pro';

/** [라벨, 제공 여부, (선택) 부가 설명] — note 가 있으면 체크/X 대신 그 텍스트를 보여준다. */
export type PlanFeature = [label: string, included: boolean, note?: string];

export type PlanFacts = {
  id: PlanId;
  name: string;
  price: string;
  /** 가격 옆 보조 텍스트(예: "/ 월", "가입 시 제공"). */
  sub: string;
  /** 피처 매트릭스. 모든 플랜이 같은 행 순서·라벨을 쓴다. */
  feats: PlanFeature[];
  /**
   * 시각적 강조 대상인지.
   *
   * "인기" 같은 사실 주장은 쓰지 않는다 — 사용자 수·판매량 데이터가 없다.
   * (PRODUCT.md: 없는 것을 있다고 하지 않는다)
   */
  hot?: boolean;
};

/**
 * 서버 등급 → 카드 id.
 *
 * **가격표에 카드가 없는 등급도 여기에는 있어야 한다.** PRO 는 더 이상 팔지 않지만
 * 쿠폰(`grantTier: PRO`)으로 받은 사용자가 실제로 존재한다. 목록에서 지우면 그 사용자의
 * 등급이 "모르는 값"이 되어 마이페이지·기록 화면이 무료로 잘못 표시한다.
 */
const SERVER_TIER_TO_PLAN_ID: Record<string, PlanId> = {
  BASIC: 'basic',
  PLUS: 'plus',
  PRO: 'pro',
};

/**
 * 등급 이름. 가격표에 카드가 없는 PRO 도 부를 이름은 있어야 한다(위 주석 참고).
 */
export const PLAN_NAMES: Record<PlanId, string> = {
  basic: '무료',
  plus: '베이직',
  pro: '프로',
};

/**
 * 가격표에 카드로 세우는 개인 요금제.
 *
 * ## 왜 두 장인가
 *
 * 파는 개인 플랜은 무료와 베이직 둘이다. 세 번째 자리는 행사용 Enterprise 가 받는다
 * (`ENTERPRISE_FACTS`) — 화면에는 무료 · 베이직 · 엔터프라이즈 셋이 선다.
 * PRO(₩9,900) 는 가격표에서 내렸다. 등급 자체는 서버에 남아 있고 쿠폰으로 받은 사용자도
 * 있으므로 `PLAN_NAMES` 와 `toPlanId` 는 계속 PRO 를 안다.
 *
 * ## 피처 행은 서버가 실제로 가르는 것만 적는다
 *
 * 백엔드가 요금제로 가르는 것은 **딱 두 가지**다(2026-08-28 `/v3/api-docs` 실측):
 *
 *   - 커스텀 프레임 보관 개수 — `frameRetentionLimit` (BASIC 0 / PLUS 3 / PRO -1)
 *   - 보관 기간 — 기간이 지난 프레임·사진은 `SUBS-002` 로 막힌다
 *
 * 그 밖에는 등급 개념이 아예 없다. 스펙 전문에 `광고`·`filter` 는 0건이고, `보정` 은
 * 1건인데 그마저 "남은 개수를 0 으로 **보정**한다"는 다른 뜻이다.
 *
 * 그래서 예전 표의 "광고 제거"와 "AI (추후)" 행을 걷어냈다. 양쪽 다 X 인 행은 플랜을
 * 고르는 데 아무 정보도 주지 않으면서, 유료 칸에 체크가 붙어 있던 동안에는 서버가 하지
 * 않는 일을 한다고 말하고 있었다. 보정은 등급과 무관하게 모두 되므로 그렇게 적는다.
 */
export const PLAN_FACTS: PlanFacts[] = [
  {
    id: 'basic',
    name: PLAN_NAMES.basic,
    price: '무료',
    sub: '가입 시 제공',
    feats: [
      // 서버 한도가 0 이라 첫 프레임부터 403(SUBS-003) 이다. 실측으로 확인했다.
      ['커스텀 프레임', false],
      ['사진 보관 기간', true, '3일'],
      ['보정 필터', true, '모든 플랜'],
    ],
  },
  {
    id: 'plus',
    name: PLAN_NAMES.plus,
    price: '₩3,900',
    sub: '/ 월',
    hot: true,
    feats: [
      ['커스텀 프레임', true, '3개'],
      ['사진 보관 기간', true, '3개월'],
      ['보정 필터', true, '모든 플랜'],
    ],
  },
];

/**
 * Enterprise — 팬미팅·행사용. 지금은 셀프 관리자 화면 없이 사람이 직접 세팅한다.
 * "추후 출시"가 아니라 지금 살 수 있는 것이므로 준비 중이라고 말하지 않는다.
 * 값은 행사 규모·기간에 따라 달라 정찰가를 붙이지 않고 견적으로 안내한다.
 */
export const ENTERPRISE_FACTS = {
  name: '엔터프라이즈',
  badge: '행사용',
  price: '규모에 맞춰 견적',
  desc: '부스 대신 QR 한 장이에요. 행사 이름과 컷 구성을 맞춘 촬영 주소를 드리면, 참가자는 가입 없이 자기 휴대폰으로 찍고 그 자리에서 가져가요.',
  cta: '행사 도입 알아보기',
  /** 웹 경로. 앱은 웹을 그대로 띄우므로 이 경로 하나면 양쪽이 같은 화면으로 간다. */
  href: '/enterprise',
} as const;

/**
 * 서버가 주는 등급("BASIC" | "PLUS" | "PRO")을 카드 id 로 맞춘다.
 * 모르는 값이면 null — 임의로 basic 으로 떨어뜨려 "무료 이용 중"이라고 잘못 말하지 않는다.
 *
 * PRO 는 가격표에 카드가 없지만 **여기서는 해석된다.** 쿠폰으로 PRO 를 받은 사용자가
 * 있고, 그 사람의 등급을 "모르는 값"으로 만들면 화면이 무료로 잘못 표시한다.
 */
export function toPlanId(tier: string | null | undefined): PlanId | null {
  if (!tier) return null;
  return SERVER_TIER_TO_PLAN_ID[tier.trim().toUpperCase()] ?? null;
}
