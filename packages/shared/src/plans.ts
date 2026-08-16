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
  /** 5행 피처 매트릭스. 모든 플랜이 같은 행 순서·라벨을 쓴다. */
  feats: PlanFeature[];
  /**
   * 시각적 강조 대상인지.
   *
   * "인기" 같은 사실 주장은 쓰지 않는다 — 사용자 수·판매량 데이터가 없다.
   * (PRODUCT.md: 없는 것을 있다고 하지 않는다)
   */
  hot?: boolean;
};

// 5행 피처 라벨(순서 고정):
// 커스텀 프레임 / 사진 보관 기간 / 보정 / 광고 제거 / AI (추후)
export const PLAN_FACTS: PlanFacts[] = [
  {
    id: 'basic',
    name: 'Free',
    price: '무료',
    sub: '가입 시 제공',
    feats: [
      ['커스텀 프레임', false],
      ['사진 보관 기간', true, '3일'],
      // 보정은 아직 플랜으로 막지 않는다. 서버에 해당 권한 개념이 없고 결제도 열리기 전이라,
      // 지금 클라이언트에서만 막으면 모두에게서 되는 기능을 빼앗는 셈이 된다.
      ['보정', false, '결제 오픈 전까지 이용 가능'],
      // 광고 역시 아직 붙이지 않았다. 결제가 열린 뒤부터 Free 에 노출한다는 계획을 적는다.
      ['광고 제거', false, '결제 오픈 후 보정·다운로드 시 노출'],
      ['AI (추후)', false],
    ],
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '₩3,900',
    sub: '/ 월',
    hot: true,
    feats: [
      ['커스텀 프레임', true, '3개'],
      ['사진 보관 기간', true, '3달'],
      ['보정', true],
      ['광고 제거', true],
      ['AI (추후)', false],
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₩9,900',
    sub: '/ 월',
    feats: [
      ['커스텀 프레임', true, '무제한'],
      ['사진 보관 기간', true, '무제한'],
      ['보정', true],
      ['광고 제거', true],
      // 아직 아무도 못 쓴다. 라벨이 "(추후)"인데 체크를 주면 Pro 는 지금 된다는 말이 된다.
      ['AI (추후)', false],
    ],
  },
];

/**
 * Enterprise — 팬미팅·행사용. 지금은 셀프 관리자 화면 없이 사람이 직접 세팅한다.
 * "추후 출시"가 아니라 지금 살 수 있는 것이므로 준비 중이라고 말하지 않는다.
 * 값은 행사 규모·기간에 따라 달라 정찰가를 붙이지 않고 견적으로 안내한다.
 */
export const ENTERPRISE_FACTS = {
  name: 'Enterprise',
  badge: '행사용',
  price: '규모에 맞춰 견적',
  desc: '부스 대신 QR 한 장이에요. 행사 이름과 컷 구성을 맞춘 촬영 주소를 드리면, 참가자는 가입 없이 자기 휴대폰으로 찍고 그 자리에서 가져가요.',
  cta: '행사 도입 알아보기',
  /** 웹 경로. 앱에서는 아래 SITE_ORIGIN 과 합쳐 외부 브라우저로 연다. */
  href: '/enterprise',
} as const;

/**
 * 공개 웹사이트 오리진.
 *
 * 앱에는 행사 소개 화면이 없다(출시 초기에는 문의를 사람이 받아 수동으로 세팅한다).
 * 그래서 앱의 Enterprise 카드는 이 주소 + ENTERPRISE_FACTS.href 를 외부 브라우저로 연다.
 * 앱 안에 같은 화면을 다시 만들면 또 두 곳이 어긋난다.
 */
export const SITE_ORIGIN = 'https://www.harucut.com';

/** 앱에서 웹 페이지를 열 때 쓰는 절대 주소. */
export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 서버가 주는 등급("BASIC" | "PLUS" | "PRO")을 카드 id 로 맞춘다.
 * 모르는 값이면 null — 임의로 basic 으로 떨어뜨려 "Free 이용 중"이라고 잘못 말하지 않는다.
 */
export function toPlanId(tier: string | null | undefined): PlanId | null {
  if (!tier) return null;
  const id = tier.toLowerCase();
  return PLAN_FACTS.some((plan) => plan.id === id) ? (id as PlanId) : null;
}
