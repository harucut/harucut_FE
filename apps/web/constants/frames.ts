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

// 표시 이름은 배치 형태를 그대로 부른다(세로/가로/네모/즉석사진).
// 이 목록이 프레임 순서와 표시 이름의 단일 소스다 — 카드 소개 카피는 lib/frameCatalog.ts가 맡는다.
// id와 백엔드 enum(RemoteFrameType: CLASSIC·WIDE·GRID·POLAROID)은 서버 계약이라 건드리지 않는다 —
// 이름만 바꾸고 매핑은 lib/frameApi.ts 그대로 둔다.
export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: "classic-4",
    name: "세로 4컷",
    slots: 4,
  },
  {
    id: "wide-4",
    name: "가로 4컷",
    slots: 4,
  },
  {
    id: "grid-4",
    name: "네모 4컷",
    slots: 4,
  },
  {
    id: "polaroid-4",
    name: "즉석사진 4컷",
    slots: 4,
  },
];

export function isFrameId(value: string): value is FrameId {
  return FRAME_IDS.includes(value as FrameId);
}
