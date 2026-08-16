// 하루컷 요금제 — 웹 요금제 페이지(PricingView)·앱(pricing-screen)이 공유하는 단일 소스.
// 값 변경 시 이 파일과 mobile/screens/pricing-screen.tsx를 함께 맞춘다.
// (Free 무료 / Plus ₩3,900 / Pro ₩9,900, 5행 피처. Enterprise는 추후 출시 예정.)

export type PlanId = "basic" | "plus" | "pro";

// [라벨, 제공 여부, (선택) 부가 설명]
// note가 있으면 비교표/카드에서 체크/X 대신 그 텍스트를 보여준다(개수·기간·"미정" 등).
export type PlanFeature = [label: string, included: boolean, note?: string];

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  // 가격 옆 보조 텍스트(예: "/ 월", "가입 시 제공").
  sub: string;
  cta: string;
  // 5행 피처 매트릭스(모든 플랜 동일한 행 순서/라벨).
  feats: PlanFeature[];
  // 강조 표시. 사용량 데이터가 없으므로 "인기" 같은 사실 주장은 쓰지 않는다.
  hot?: boolean;
  badge?: string;
};

// 5행 피처 라벨(순서 고정):
// 커스텀 프레임 / 사진 보관 기간 / 보정 / 광고 제거 / AI (추후)
export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Free",
    price: "무료",
    sub: "가입 시 제공",
    cta: "무료로 시작하기",
    feats: [
      ["커스텀 프레임", false],
      ["사진 보관 기간", true, "3일"],
      // 보정은 아직 플랜으로 막지 않는다. 서버에 해당 권한 개념이 없고 결제도 열리기 전이라,
      // 지금 클라이언트에서만 막으면 모두에게서 되는 기능을 빼앗는 셈이 된다.
      ["보정", false, "결제 오픈 전까지 이용 가능"],
      // 광고 역시 아직 붙이지 않았다. 결제가 열린 뒤부터 Free에 노출한다는 계획을 적는다.
      ["광고 제거", false, "결제 오픈 후 보정·다운로드 시 노출"],
      ["AI (추후)", false],
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "₩3,900",
    sub: "/ 월",
    cta: "Plus 시작하기",
    hot: true,
    feats: [
      ["커스텀 프레임", true, "3개"],
      ["사진 보관 기간", true, "3달"],
      ["보정", true],
      ["광고 제거", true],
      ["AI (추후)", false],
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₩9,900",
    sub: "/ 월",
    cta: "Pro 시작하기",
    feats: [
      ["커스텀 프레임", true, "무제한"],
      ["사진 보관 기간", true, "무제한"],
      ["보정", true],
      ["광고 제거", true],
      // 아직 아무도 못 쓴다. 라벨이 "(추후)"인데 체크를 주면 Pro 는 지금 된다는 말이 된다.
      ["AI (추후)", false],
    ],
  },
];

// Enterprise — 팬미팅·행사용. 지금은 셀프 관리자 화면 없이 사람이 직접 세팅해 드린다.
// "추후 출시"가 아니라 지금 살 수 있는 것이므로, 준비 중이라고 말하지 않는다.
// 값은 행사 규모·기간에 따라 달라서 정찰가를 붙이지 않고 견적으로 안내한다.
export const ENTERPRISE_TEASER = {
  name: "Enterprise",
  badge: "행사용",
  price: "규모에 맞춰 견적",
  desc: "부스 대신 QR 한 장이에요. 행사 이름과 컷 구성을 맞춘 촬영 주소를 드리면, 참가자는 가입 없이 자기 휴대폰으로 찍고 그 자리에서 가져가요.",
  cta: "행사 도입 알아보기",
  href: "/enterprise",
} as const;

// 서버가 주는 등급("BASIC" | "PLUS" | "PRO")을 카드 id로 맞춘다.
// 백엔드는 대문자, 카드는 소문자 id(basic/plus/pro)를 쓰므로 여기서 한 번만 흡수한다.
// 모르는 값이면 null — 임의로 basic으로 떨어뜨려 "Free 이용 중"이라고 잘못 말하지 않는다.
export function toPlanId(tier: string | null | undefined): PlanId | null {
  if (!tier) return null;
  const id = tier.toLowerCase();
  return PLANS.some((plan) => plan.id === id) ? (id as PlanId) : null;
}

// 서버 등급을 카드 이름(Free/Plus/Pro)으로 바꾼다. 모르는 값이면 null.
export function getPlanDisplayName(tier: string | null | undefined): string | null {
  const id = toPlanId(tier);
  return id ? (PLANS.find((plan) => plan.id === id)?.name ?? null) : null;
}

// 요금제 페이지 헤더 카피. 로그인 후에는 "비회원" 안내가 의미 없어 문장을 바꾼다.
export const PRICING_HEADLINE = "나에게 맞는 플랜";
export const PRICING_SUBTITLE =
  "비회원도 촬영은 무료예요. 커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요.";
export const PRICING_SUBTITLE_AUTHED =
  "커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요. 결제 기능은 준비 중이에요.";
// 결제 미오픈 안내 — 요금제 카드 CTA·footnote가 함께 쓴다.
export const PRICING_BILLING_PENDING = "결제 기능은 준비 중이에요.";
// 요금제를 내릴 때의 안내(비활성화 정책).
export const PRICING_DOWNGRADE_NOTE =
  "요금제를 내리면 하위 플랜의 보관 기간·개수까지만 유지되고, 초과분은 삭제되지 않고 비활성화돼요.";
