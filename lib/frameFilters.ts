export type FourcutFilterId = "NONE" | "B&W" | "BRIGHT" | "SOFT";

export type FourcutFilterOption = {
  id: FourcutFilterId;
  label: string;
  description: string;
  cssFilter: string;
  canvasFilter: string;
};

export const DEFAULT_FOURCUT_FILTER: FourcutFilterId = "NONE";

export const FOURCUT_FILTERS: FourcutFilterOption[] = [
  {
    id: "NONE",
    label: "기본",
    description: "원본 톤 그대로",
    cssFilter: "none",
    canvasFilter: "none",
  },
  {
    id: "B&W",
    label: "흑백",
    description: "차분한 필름 톤",
    cssFilter: "grayscale(1)",
    canvasFilter: "grayscale(1)",
  },
  {
    id: "BRIGHT",
    label: "밝게",
    description: "밝고 또렷하게",
    cssFilter: "brightness(1.14) saturate(1.04) contrast(1.02)",
    canvasFilter: "brightness(1.14) saturate(1.04) contrast(1.02)",
  },
  {
    id: "SOFT",
    label: "뽀샤시",
    description: "은은하고 부드럽게",
    cssFilter: "brightness(1.08) contrast(0.94) saturate(0.92) blur(0.45px)",
    canvasFilter: "brightness(1.08) contrast(0.94) saturate(0.92) blur(0.45px)",
  },
];

export function getFourcutFilterOption(filterId: FourcutFilterId) {
  return FOURCUT_FILTERS.find((filter) => filter.id === filterId) ?? FOURCUT_FILTERS[0];
}

export function getFourcutFilterCssValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).cssFilter;
}

export function getFourcutFilterCanvasValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).canvasFilter;
}
