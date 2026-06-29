// 하루컷 요금제 — 웹 요금제 페이지(PricingView)·앱(pricing-screen)이 공유하는 단일 소스.
// 값 변경 시 이 파일과 mobile/screens/pricing-screen.tsx를 함께 맞춘다.
// (Free 무료 / Plus ₩3,900 / Pro ₩9,900, 7행 피처. Enterprise는 추후 출시 예정.)

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
  // 7행 피처 매트릭스(모든 플랜 동일한 행 순서/라벨).
  feats: PlanFeature[];
  // Plus = 인기 강조.
  hot?: boolean;
  badge?: string;
};

// 7행 피처 라벨(순서 고정):
// 커스텀 프레임 / 워터마크 해제 / 사진 보관 기간 / 보정 / 광고 제거 / AI (추후) / 동영상 (추후)
// 워터마크는 전 플랜 기본 포함. Free는 제거 불가, Plus·Pro는 해제 가능(기본값은 항상 포함).
export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Free",
    price: "무료",
    sub: "가입 시 제공",
    cta: "무료로 시작하기",
    feats: [
      ["커스텀 프레임", false],
      ["워터마크 해제", false, "기본 포함 (고정)"],
      ["사진 보관 기간", true, "3일"],
      ["보정", false],
      ["광고 제거", false, "보정·다운로드 시 노출"],
      ["AI (추후)", false],
      ["동영상 (추후)", false],
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "₩3,900",
    sub: "/ 월",
    cta: "Plus 시작하기",
    hot: true,
    badge: "인기",
    feats: [
      ["커스텀 프레임", true, "3개"],
      ["워터마크 해제", true, "선택 (기본 포함)"],
      ["사진 보관 기간", true, "3달"],
      ["보정", true],
      ["광고 제거", true],
      ["AI (추후)", false],
      ["동영상 (추후)", false, "미정"],
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
      ["워터마크 해제", true, "선택 (기본 포함)"],
      ["사진 보관 기간", true, "무제한"],
      ["보정", true],
      ["광고 제거", true],
      ["AI (추후)", true],
      ["동영상 (추후)", false, "미정"],
    ],
  },
];

// Enterprise — 추후 출시 예정. 팬미팅·행사처럼 공간을 미리 만들어 두면, 비회원도 QR로
// 입장해 그 자리에서 누구나 네 컷을 찍을 수 있는 행사용 플랜.
export const ENTERPRISE_TEASER = {
  name: "Enterprise",
  badge: "추후",
  price: "준비 중",
  desc: "팬미팅·행사용 플랜이에요. 공간을 미리 만들어 두면 비회원도 QR로 입장해 그 자리에서 누구나 네 컷을 찍을 수 있어요.",
  cta: "도입 문의",
} as const;

// 요금제 페이지 헤더 카피.
export const PRICING_HEADLINE = "나에게 맞는 플랜";
export const PRICING_SUBTITLE =
  "비회원도 촬영은 무료예요. 커스텀 프레임·보정·보관 기간은 플랜에 따라 달라요.";
// 요금제를 내릴 때의 안내(비활성화 정책).
export const PRICING_DOWNGRADE_NOTE =
  "요금제를 내리면 하위 플랜의 보관 기간·개수까지만 유지되고, 초과분은 삭제되지 않고 비활성화돼요.";
