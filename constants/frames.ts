export type FrameId = "classic-4" | "wide-4" | "grid-4" | "polaroid-4";

export const FRAME_IDS: FrameId[] = [
  "classic-4",
  "wide-4",
  "grid-4",
  "polaroid-4",
];

export type FrameConfig = {
  id: FrameId;
  name: string;
  slots: number;
};

export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: "classic-4",
    name: "클래식 4컷",
    slots: 4,
  },
  {
    id: "wide-4",
    name: "와이드 4컷",
    slots: 4,
  },
  {
    id: "grid-4",
    name: "2x2 그리드",
    slots: 4,
  },
  {
    id: "polaroid-4",
    name: "폴라로이드 4컷",
    slots: 4,
  },
];

export function isFrameId(value: string): value is FrameId {
  return FRAME_IDS.includes(value as FrameId);
}
