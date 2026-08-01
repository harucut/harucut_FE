import type { FrameId } from "@/constants/frames";

// 프레임 고르기 화면에서 카드에 얹는 소개 카피.
// 표시 이름(name)과 슬롯 수는 constants/frames.ts의 FRAME_CONFIGS가 단일 소스라
// 여기서는 중복해 들고 있지 않는다 — 이 파일은 "설명"만 담당한다.
// 서버 enum(RemoteFrameType: CLASSIC·WIDE·GRID·POLAROID)과 헷갈릴 수 있는
// category 같은 분류 필드는 두지 않는다. 매핑은 lib/frameApi.ts 한 곳에서만 한다.
export type FrameCatalogItem = {
  id: FrameId;
  /** 미리보기 위에 얹는 짧은 태그. */
  shortLabel: string;
  /** 이 배치가 어떤 성격인지 한마디로. */
  badge: string;
  description: string;
  /** 어떤 상황에 고르면 좋은지. */
  recommendedFor: string[];
};

export const FRAME_CATALOG: FrameCatalogItem[] = [
  {
    id: "classic-4",
    shortLabel: "BEST",
    badge: "정석 포토부스",
    description:
      "네 컷이 세로로 길게 이어지는 가장 익숙한 구성이에요. 데이트와 일상 기록에 안정적으로 어울려요.",
    recommendedFor: ["데이트", "우정컷", "일상 기록"],
  },
  {
    id: "wide-4",
    shortLabel: "MOOD",
    badge: "배경까지 담는 구성",
    description:
      "가로로 넓은 판형이라 공간감과 표정을 함께 남기기 좋아요. 여행, 카페, 전시 기록에 특히 잘 맞아요.",
    recommendedFor: ["여행", "공간 무드", "2인 이상"],
  },
  {
    id: "grid-4",
    shortLabel: "EDIT",
    badge: "콘텐츠형 콜라주",
    description:
      "네 컷을 2×2로 반듯하게 모아 담아요. 표정 변화나 소품 샷을 정리해 보여주기 좋아 업로드형 제작에 강해요.",
    recommendedFor: ["업로드 제작", "표정 변주", "콘텐츠 컷"],
  },
  {
    id: "polaroid-4",
    shortLabel: "THEME",
    badge: "꾸미기 특화",
    description:
      "즉석사진을 흩뿌린 듯 엇갈리게 배치해요. 스티커·텍스트·배경을 올리면 스크랩북처럼 완성돼요.",
    recommendedFor: ["기념일", "팬메이드", "테마 편집"],
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
