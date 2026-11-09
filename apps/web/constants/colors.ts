export const BORDER_COLORS = [
  { id: "studio", label: "스튜디오 라임", value: "#c8f135" },
  { id: "ink", label: "잉크 차콜", value: "#18181a" },
  { id: "ivory", label: "소프트 아이보리", value: "#fafaf7" },
  { id: "slate", label: "뮤트 슬레이트", value: "#66758c" },
  { id: "taupe", label: "웜 토프", value: "#9b8778" },
] as const;

/**
 * 편집기 배경 스와치(2026-11-09 늘림). 다섯 개로는 고를 색이 모자라 색 코드를 직접 치게 됐다.
 *
 * 이름은 화면에 쓰지 않는다 — 색은 보고 고른다. 이름은 읽기 프로그램과 툴팁에만 간다.
 * 값은 편집기 스토어가 저장하는 꼴('#' 없는 6자리)이다. 테두리 색(위)의 다섯 값은 그대로 넣어,
 * 그 색으로 저장한 프레임을 열어도 고른 상태로 보인다. 순서는 밝은 색 → 진한 색.
 * 개수는 맨 끝 「다른 색」까지 열둘이다 — 44px 견본이 폰 폭(390)에서 두 줄에 들어간다.
 */
export const BACKGROUND_COLORS = [
  { id: "ivory", label: "소프트 아이보리", value: "fafaf7" },
  { id: "butter", label: "버터 옐로", value: "f6e7a8" },
  { id: "peach", label: "피치", value: "f8d4bd" },
  { id: "pink", label: "블러시 핑크", value: "f4c6d0" },
  { id: "lavender", label: "라벤더", value: "dcd3f2" },
  { id: "sky", label: "스카이 블루", value: "cbe0f4" },
  { id: "mint", label: "민트", value: "cde9d8" },
  { id: "studio", label: "스튜디오 라임", value: "c8f135" },
  { id: "taupe", label: "웜 토프", value: "9b8778" },
  { id: "slate", label: "뮤트 슬레이트", value: "66758c" },
  { id: "ink", label: "잉크 차콜", value: "18181a" },
] as const;

/** 편집기를 처음 열었을 때의 배경. 스와치에 있는 색이라 고른 상태로 보인다. */
export const DEFAULT_EDITOR_BACKGROUND_COLOR = "18181a";
