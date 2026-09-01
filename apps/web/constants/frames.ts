export type FrameId = "classic-4" | "wide-4" | "grid-4" | "polaroid-4";

export type FrameConfig = {
  id: FrameId;
  name: string;
  slots: number;
  /**
   * 추천 프레임. **하나에만 붙인다.**
   *
   * 예전에는 네 프레임에 각각 BEST·MOOD·EDIT·THEME 를 달았다. 그런데 MOOD·EDIT·THEME 는
   * 가로 4컷이 왜 MOOD 인지 설명하지 못하는 분위기 단어였고, 무엇보다 **넷 다 칩을 달면
   * BEST 가 추천으로 안 읽힌다** — 추천 표시는 혼자일 때만 작동한다.
   *
   * 라벨 문구는 데이터가 아니라 FramePicker 가 정한다. 여기는 "어느 것이 추천인가"만 안다.
   */
  recommended?: boolean;
};

// 표시 이름은 배치 형태를 그대로 부른다(세로/가로/네모/즉석사진).
// 이 목록이 프레임에 관한 모든 표시 정보의 단일 소스다.
//
// 예전에는 소개 카피(배지·설명·추천 태그)를 lib/frameCatalog.ts 가 따로 들고 있었다. 그런데
// 그 글이 하는 일이 **바로 위 미리보기가 이미 보여주는 것을 말로 옮기는 것**이었고, 추천 태그는
// 네 프레임에 전부 해당돼(일상 기록·우정컷 …) 고르는 데 도움이 되지 않았다. 게다가 카드가
// 캐러셀이라 한 번에 하나만 보이니 글끼리 비교도 안 됐다. 걷어내고 그림을 키웠다.
//
// id와 백엔드 enum(RemoteFrameType: CLASSIC·WIDE·GRID·POLAROID)은 서버 계약이라 건드리지 않는다 —
// 이름만 바꾸고 매핑은 lib/frameApi.ts 그대로 둔다.
export const FRAME_CONFIGS: FrameConfig[] = [
  {
    id: "classic-4",
    recommended: true,
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

export function getFrameConfig(frameId: FrameId) {
  return FRAME_CONFIGS.find((frame) => frame.id === frameId) ?? FRAME_CONFIGS[0];
}

export function isFrameId(value: string | null | undefined): value is FrameId {
  return FRAME_CONFIGS.some((frame) => frame.id === value);
}

/** 주소의 `?frame=` 값. 모르는 값이면 null 이라 호출부가 기본 프레임으로 떨어진다. */
export function parseFrameIdQuery(value: string | null | undefined) {
  if (!value) return null;
  return isFrameId(value) ? value : null;
}
