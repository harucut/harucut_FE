"use client";

import type { ThemeExportJson } from "@/lib/types/themeEditor";

export const DEFAULT_FRAME_BACKGROUND_COLOR = "#18181b";

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

export function resolveFrameBackgroundColor(
  theme: ThemeExportJson | null | undefined,
  fallback: string = DEFAULT_FRAME_BACKGROUND_COLOR,
) {
  if (theme?.background?.type === "COLOR") {
    return normalizeHexColor(theme.background.value, fallback);
  }

  return normalizeHexColor(fallback, DEFAULT_FRAME_BACKGROUND_COLOR);
}
