export const BORDER_COLORS = [
  { id: "ink", label: "잉크 차콜", value: "#23262d" },
  { id: "ivory", label: "소프트 아이보리", value: "#f3efe7" },
  { id: "slate", label: "뮤트 슬레이트", value: "#66758c" },
  { id: "taupe", label: "웜 토프", value: "#9b8778" },
] as const;

export type BorderColorId = (typeof BORDER_COLORS)[number]["id"];
export type BorderColorValue = (typeof BORDER_COLORS)[number]["value"];

export const BACKGROUND_COLORS = [
  { id: "ivory", label: "소프트 아이보리", value: "f3efe7" },
  { id: "ink", label: "잉크 차콜", value: "23262d" },
  { id: "slate", label: "뮤트 슬레이트", value: "66758c" },
  { id: "taupe", label: "웜 토프", value: "9b8778" },
] as const;
