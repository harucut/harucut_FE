export const BORDER_COLORS = [
  { id: "studio", label: "스튜디오 그린", value: "#1ed760" },
  { id: "ink", label: "잉크 차콜", value: "#18181a" },
  { id: "ivory", label: "소프트 아이보리", value: "#fafaf7" },
  { id: "slate", label: "뮤트 슬레이트", value: "#66758c" },
  { id: "taupe", label: "웜 토프", value: "#9b8778" },
] as const;

// 편집기 배경 스와치 — 색은 위 다섯 그대로다. 순서만 편집기 것이고, 값은 편집기 스토어가
// 저장하는 꼴('#' 없는 6자리)로 둔다.
export const BACKGROUND_COLORS = (
  ["ivory", "studio", "ink", "slate", "taupe"] as const
).map((id) => {
  const color = BORDER_COLORS.find((candidate) => candidate.id === id)!;
  return { ...color, value: color.value.slice(1) };
});
