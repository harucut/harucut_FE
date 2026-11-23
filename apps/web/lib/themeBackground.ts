"use client";

import type { ThemeExportJson } from "@/lib/types/themeEditor";

/**
 * 꾸미지 않은 프레임의 기본 테두리 색 — 소프트 아이보리(견본 첫 색). 프레임 고르기 카드도 이 색으로 그린다.
 *
 * 2026-11-15 「사진 고를 때도 프레임 고른 디자인으로 보여줘야」. 카드는 흰 종이(#FFFFFF)에 예시 사진을 넣어
 * 보여 주는데, 고르고 나면 사진 고르기·결과물이 짙은 차콜(#18181a, 그 전엔 #23262d)이라 다른 프레임처럼 보였다.
 * 카드와 기본값을 한 값으로 묶어, 고른 그대로 보이고 그대로 나온다. 견본에 있는 색이라 처음부터 고른 상태로 보인다.
 */
export const DEFAULT_FRAME_BACKGROUND_COLOR = "#fafaf7";

export function normalizeHexColor(
  input?: string | null,
  fallback: string = DEFAULT_FRAME_BACKGROUND_COLOR,
) {
  const fallbackHex = fallback.trim().replace(/^#/, "");
  const cleaned = (input ?? "").trim().replace(/^#/, "");
  const hex = cleaned.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toLowerCase();

  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  if (hex.length === 6) {
    return `#${hex}`;
  }

  return `#${fallbackHex.padEnd(6, "0").slice(0, 6)}`;
}

/**
 * 이 배경색 위에서 읽히는 글자색(흰색과 잉크 중 대비가 큰 쪽). 배경이 이미지면 밝기를 모르니 null 을 넘기고 흰색을 받는다.
 */
export function readableTextColorOn(background?: string | null) {
  if (!background) return "#ffffff";
  const hex = normalizeHexColor(background).slice(1);
  const [r, g, b] = [0, 2, 4]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 흰색과 검정의 대비가 같아지는 밝기가 0.179 다.
  return luminance > 0.179 ? "#14140f" : "#ffffff";
}

export function resolveFrameBackgroundColor(
  theme: ThemeExportJson | null | undefined,
  fallback: string = DEFAULT_FRAME_BACKGROUND_COLOR,
) {
  if (theme?.background?.type === "COLOR") {
    return normalizeHexColor(theme.background.value, fallback);
  }

  return normalizeHexColor(fallback, DEFAULT_FRAME_BACKGROUND_COLOR);
}
