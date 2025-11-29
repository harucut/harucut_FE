export type FrameId = "classic-4" | "wide-4" | "grid-4" | "polaroid-4";

export type FrameConfig = {
  id: FrameId;
  name: string;
  description: string;
  slots: number;
};

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: "classic-4",
    name: "클래식 4컷",
    description: "세로로 길게 이어지는 기본 인생네컷",
    slots: 4,
  },
  {
    id: "wide-4",
    name: "와이드 4컷",
    description: "가로로 넓게 보이는 4컷",
    slots: 4,
  },
  {
    id: "grid-4",
    name: "2x2 그리드",
    description: "두 줄로 나뉘는 4컷 레이아웃",
    slots: 4,
  },
  {
    id: "polaroid-4",
    name: "폴라로이드 4컷",
    description: "사진 아래에 여백이 들어가는 스타일",
    slots: 4,
  },
];
