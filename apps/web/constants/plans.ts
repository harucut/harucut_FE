// 하루컷 요금제 — 핸드오프(handoff/app/pricing.jsx)와 1:1 일치하는 단일 소스.
// 웹 요금제 페이지(PricingView)·랜딩(LandingView)·앱이 같은 값/피처 매트릭스를 공유한다.
// 값 변경 시 이 파일만 수정한다. (BASIC 무료 / PLUS ₩3,900 / PRO ₩7,900, 6행 피처)

export type PlanId = "basic" | "plus" | "pro";

// [라벨, 제공 여부, (선택) 부가 설명]
export type PlanFeature = [label: string, included: boolean, note?: string];

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  // 가격 옆 보조 텍스트(예: "/ 월", "가입 시 제공").
  sub: string;
  cta: string;
  // 6행 피처 매트릭스(모든 플랜 동일한 행 순서/라벨).
  feats: PlanFeature[];
  // PLUS = 인기 강조.
  hot?: boolean;
  badge?: string;
};

// 6행 피처 라벨(순서 고정): 촬영·업로드 / 다운로드·저장 / 영상 생성 / 프레임 보관 / 사진 내역 / 워터마크 제거
export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "BASIC",
    price: "무료",
    sub: "가입 시 제공",
    cta: "시작하기",
    feats: [
      ["촬영·업로드", true, "이미지 무제한"],
      ["다운로드·저장", true],
      ["영상 생성", true, "월 5회"],
      ["프레임 보관", true, "1개"],
      ["사진 내역", true, "3일 보관"],
      ["워터마크 제거", false],
    ],
  },
  {
    id: "plus",
    name: "PLUS",
    price: "₩3,900",
    sub: "/ 월",
    cta: "PLUS 시작하기",
    hot: true,
    badge: "인기",
    feats: [
      ["촬영·업로드", true, "이미지 무제한"],
      ["다운로드·저장", true],
      ["영상 생성", true, "월 30회"],
      ["프레임 보관", true, "5개"],
      ["사진 내역", true, "무제한"],
      ["워터마크 제거", true],
    ],
  },
  {
    id: "pro",
    name: "PRO",
    price: "₩7,900",
    sub: "/ 월",
    cta: "PRO 시작하기",
    feats: [
      ["촬영·업로드", true, "이미지 무제한"],
      ["다운로드·저장", true],
      ["영상 생성", true, "무제한"],
      ["프레임 보관", true, "10개"],
      ["사진 내역", true, "무제한"],
      ["워터마크 제거", true],
    ],
  },
];

// 요금제 페이지 헤더 카피(핸드오프 공용).
export const PRICING_HEADLINE = "나에게 맞는 플랜";
export const PRICING_SUBTITLE =
  "비회원도 촬영은 무료예요. 저장·영상·보관은 플랜에 따라 달라요.";
