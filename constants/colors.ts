export const BORDER_COLORS = [
  { id: "black", label: "블랙", value: "#000000" },
  { id: "white", label: "화이트", value: "#ffffff" },
  { id: "zinc", label: "다크 그레이", value: "#18181b" },
  { id: "pink", label: "핑크", value: "#f973b6" },
  { id: "blue", label: "블루", value: "#38bdf8" },
] as const;

export type BorderColorId = (typeof BORDER_COLORS)[number]["id"];
export type BorderColorValue = (typeof BORDER_COLORS)[number]["value"];
