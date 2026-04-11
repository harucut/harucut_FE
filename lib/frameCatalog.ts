import type { FrameId } from "@/constants/frames";

export type FrameCatalogItem = {
  id: FrameId;
  name: string;
  shortLabel: string;
  badge: string;
  category: string;
  description: string;
  recommendedFor: string[];
  accentClassName: string;
  surfaceClassName: string;
};

export const FRAME_CATALOG: FrameCatalogItem[] = [
  {
    id: "classic-4",
    name: "클래식 4컷",
    shortLabel: "BEST",
    badge: "정석 포토부스",
    category: "CLASSIC",
    description:
      "가장 익숙한 인생네컷 비율로, 데이트와 일상 기록에 안정적으로 어울리는 레이아웃이에요.",
    recommendedFor: ["데이트", "우정컷", "일상 기록"],
    accentClassName: "from-emerald-200 via-lime-100 to-white",
    surfaceClassName: "from-emerald-400/15 via-emerald-200/5 to-transparent",
  },
  {
    id: "wide-4",
    name: "와이드 4컷",
    shortLabel: "MOOD",
    badge: "배경까지 담는 구성",
    category: "WIDE",
    description:
      "공간감과 표정을 함께 남기고 싶을 때 좋아요. 여행, 카페, 전시 기록에 특히 잘 맞아요.",
    recommendedFor: ["여행", "공간 무드", "2인 이상"],
    accentClassName: "from-fuchsia-200 via-violet-100 to-white",
    surfaceClassName: "from-fuchsia-400/15 via-violet-300/5 to-transparent",
  },
  {
    id: "grid-4",
    name: "2x2 그리드",
    shortLabel: "EDIT",
    badge: "콘텐츠형 콜라주",
    category: "GRID",
    description:
      "표정 변화나 소품 샷을 정리해서 보여주기 좋아 업로드형 제작에 강한 레이아웃이에요.",
    recommendedFor: ["업로드 제작", "표정 변주", "콘텐츠 컷"],
    accentClassName: "from-amber-200 via-orange-100 to-white",
    surfaceClassName: "from-amber-300/15 via-orange-300/5 to-transparent",
  },
  {
    id: "polaroid-4",
    name: "폴라로이드 4컷",
    shortLabel: "THEME",
    badge: "꾸미기 특화",
    category: "POLAROID",
    description:
      "스티커와 텍스트, 배경을 올렸을 때 가장 감성적으로 완성되는 스크랩북 무드 레이아웃이에요.",
    recommendedFor: ["기념일", "팬메이드", "테마 편집"],
    accentClassName: "from-sky-200 via-cyan-100 to-white",
    surfaceClassName: "from-sky-300/15 via-cyan-300/5 to-transparent",
  },
];

export function getFrameCatalogItem(frameId: FrameId) {
  return FRAME_CATALOG.find((frame) => frame.id === frameId) ?? FRAME_CATALOG[0];
}

export function isFrameCatalogId(value: string | null | undefined): value is FrameId {
  return FRAME_CATALOG.some((frame) => frame.id === value);
}

export function parseFrameIdQuery(value: string | null | undefined) {
  if (!value) return null;
  return isFrameCatalogId(value) ? value : null;
}
