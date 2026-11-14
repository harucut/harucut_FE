"use client";

import type { ThemeExportJson } from "@/lib/types/themeEditor";

/**
 * 꾸미지 않은 프레임의 기본 테두리 색. 편집기의 기본 배경(잉크 차콜, DEFAULT_EDITOR_BACKGROUND_COLOR)과 같다.
 * 예전 값 #23262d 는 견본에 없는 색이라, 사진 고르기가 편집기와 같은 견본을 쓰면서(2026-11-14) 처음부터
 * 「다른 색」을 고른 것처럼 보였다.
 */
export const DEFAULT_FRAME_BACKGROUND_COLOR = "#18181a";

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
