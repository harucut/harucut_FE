import {
  DEFAULT_FOURCUT_FILTER,
  FOURCUT_FILTER_DEFINITIONS,
  type FourcutFilterId,
} from "@harucut/shared";

export type { FourcutFilterId };
export { DEFAULT_FOURCUT_FILTER };

export type FourcutFilterOption = {
  id: FourcutFilterId;
  label: string;
  description: string;
  cssFilter: string;
  canvasFilter: string;
};

// id/라벨/설명/순서는 공통 패키지에서 오고, 실제 필터 값만 웹 구현이다.
const FILTER_VALUES: Record<FourcutFilterId, string> = {
  NONE: "none",
  "B&W": "grayscale(1)",
  BRIGHT: "brightness(1.14) saturate(1.04) contrast(1.02)",
  SOFT: "brightness(1.08) contrast(0.94) saturate(0.92) blur(0.45px)",
};

export const FOURCUT_FILTERS: FourcutFilterOption[] = FOURCUT_FILTER_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    cssFilter: FILTER_VALUES[definition.id],
    canvasFilter: FILTER_VALUES[definition.id],
  }),
);

export function getFourcutFilterOption(filterId: FourcutFilterId) {
  return FOURCUT_FILTERS.find((filter) => filter.id === filterId) ?? FOURCUT_FILTERS[0];
}

export function getFourcutFilterCssValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).cssFilter;
}

export function getFourcutFilterCanvasValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).canvasFilter;
}
