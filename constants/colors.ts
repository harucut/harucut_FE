export const BORDER_COLORS = [
  { id: "black", label: "블랙", value: "#000000" },
  { id: "white", label: "화이트", value: "#ffffff" },
  { id: "zinc", label: "다크 그레이", value: "#18181b" },
  { id: "pink", label: "핑크", value: "#f973b6" },
  { id: "blue", label: "블루", value: "#38bdf8" },
] as const;

export type BorderColorId = (typeof BORDER_COLORS)[number]["id"];
export type BorderColorValue = (typeof BORDER_COLORS)[number]["value"];

export const BACKGROUND_COLORS = [
  { id: "white", label: "White", value: "ffffff" },
  { id: "black", label: "Black", value: "000000" },
  { id: "zinc", label: "Zinc", value: "111827" },
  { id: "pink", label: "Pink", value: "f973b6" },
  { id: "blue", label: "Blue", value: "38bdf8" },
] as const;
