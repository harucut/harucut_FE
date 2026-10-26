import type { CSSProperties } from "react";

/**
 * 행사 페이지 테마(ADR-0008 §5, 백엔드 PageTheme · ResolvedPageTheme). 자유 CSS·임의 URL 은 받지 않는다 —
 * 허용된 색 7개 · 글꼴 이름 · 자산 참조 · 일반 텍스트 문구만이다. 서버가 게시 때 검사하지만, 그려 넣기 전에
 * 이 화면도 형식을 다시 본다(형식이 틀린 값은 버리고 기본 토큰을 쓴다).
 */
export const PAGE_THEME_COLOR_KEYS = ["bg", "card", "text", "muted", "border", "accent", "accentContrast"] as const;
export type PageThemeColorKey = (typeof PAGE_THEME_COLOR_KEYS)[number];
export type PageThemeColors = Partial<Record<PageThemeColorKey, string>>;

export const PAGE_THEME_FONTS = ["SYSTEM", "PRETENDARD", "NANUM_MYEONGJO", "GOWUN_DODUM", "BLACK_HAN_SANS"] as const;
export type PageThemeFont = (typeof PAGE_THEME_FONTS)[number];

/** 화면별 문구. 부스 대기 화면은 welcome 을 쓴다. 빠진 화면은 FE 기본 문구다. */
export const PAGE_THEME_COPY_KEYS = [
  "welcome",
  "consentIntro",
  "captureGuide",
  "composing",
  "done",
  "expired",
  "closed",
  "error",
] as const;
export type PageThemeCopyKey = (typeof PAGE_THEME_COPY_KEYS)[number];
export type PageThemeCopy = Partial<Record<PageThemeCopyKey, string>>;
export const PAGE_THEME_COPY_MAX = 200;

export type PageThemeBranding = {
  /** 하루컷 UI 표시 숨김 — 이용권 기능 WHITE_LABEL 이 있어야 게시된다. */
  hideHarucutBranding?: boolean;
  /** 완성 이미지 로고 정책. P2B 는 저장·발행만(합성 반영은 P5). */
  outputLogo?: "NONE" | "ORGANIZER_LOGO";
};

/** 행사 설정에 쓰는 모양. 로고·배경은 이 공간의 VERIFIED PAGE_THEME_ASSET id 다. */
export type PageTheme = {
  schemaVersion: 1;
  colors?: PageThemeColors;
  font?: PageThemeFont;
  logoAssetId?: string;
  backgroundAssetId?: string;
  copy?: PageThemeCopy;
  branding?: PageThemeBranding;
};

/** 공개 행사 · 부스 me · 결과 응답에 실리는 모양. 색·글꼴·브랜딩은 서버가 기본값을 채운다. 자산은 24시간 URL. */
export type ResolvedPageTheme = {
  schemaVersion?: number;
  colors?: PageThemeColors;
  font?: string;
  logoUrl?: string;
  backgroundUrl?: string;
  copy?: PageThemeCopy;
  branding?: PageThemeBranding;
};

/** 테마가 없을 때 쓰는 값 — globals.css `.ev-surface` · 백엔드 ThemeResolver.DEFAULT_COLORS 와 같아야 한다. */
export const DEFAULT_PAGE_THEME_COLORS: Record<PageThemeColorKey, string> = {
  bg: "#F6F6F4",
  card: "#FFFFFF",
  text: "#1B1B1B",
  muted: "#5E5E5E",
  border: "#DADAD8",
  accent: "#1B1B1B",
  accentContrast: "#FFFFFF",
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

const CSS_VAR: Record<PageThemeColorKey, string> = {
  bg: "--ev-bg",
  card: "--ev-card",
  text: "--ev-text",
  muted: "--ev-muted",
  border: "--ev-border",
  accent: "--ev-accent",
  accentContrast: "--ev-accent-contrast",
};

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** 서명 URL 만 받는다. 직렬화한 href 는 따옴표·역슬래시·줄바꿈이 인코딩돼 CSS url("…") 안에서 안전하다. */
export function safeAssetUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** `.ev-surface` 에 얹을 인라인 스타일. 형식이 맞는 색만 덮고, 배경 이미지는 색 위에 깐다. */
export function pageThemeStyle(theme?: ResolvedPageTheme | null): CSSProperties {
  const style: Record<string, string> = {};
  for (const key of PAGE_THEME_COLOR_KEYS) {
    const value = theme?.colors?.[key];
    if (isHexColor(value)) style[CSS_VAR[key]] = value;
  }
  const background = safeAssetUrl(theme?.backgroundUrl);
  if (background) {
    style.backgroundImage = `url("${background}")`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }
  return style as CSSProperties;
}

/** 주최자가 쓴 문구. 비었거나 문자열이 아니면 기본 문구. 일반 텍스트로만 그린다(HTML 아님). */
export function pageThemeCopy(theme: ResolvedPageTheme | null | undefined, key: PageThemeCopyKey, fallback: string) {
  const value = theme?.copy?.[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, PAGE_THEME_COPY_MAX) : fallback;
}

function luminance(hex: string) {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 대비율(1~21). 형식이 틀리면 null. */
export function contrastRatio(a: string, b: string): number | null {
  if (!isHexColor(a) || !isHexColor(b)) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 본문 글자가 읽히는 최소 대비(WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;

/** 글자와 바탕이 만나는 짝. 이 중 대비가 모자란 것을 Studio 가 경고한다. */
export const CONTRAST_PAIRS: Array<{ fg: PageThemeColorKey; bg: PageThemeColorKey; label: string }> = [
  { fg: "text", bg: "bg", label: "글자 / 바탕" },
  { fg: "text", bg: "card", label: "글자 / 카드" },
  { fg: "muted", bg: "bg", label: "보조 글자 / 바탕" },
  { fg: "accentContrast", bg: "accent", label: "버튼 글자 / 버튼" },
];

export function lowContrastPairs(colors: PageThemeColors) {
  const full = { ...DEFAULT_PAGE_THEME_COLORS, ...colors };
  return CONTRAST_PAIRS.flatMap((pair) => {
    const ratio = contrastRatio(full[pair.fg], full[pair.bg]);
    return ratio !== null && ratio < MIN_TEXT_CONTRAST ? [{ ...pair, ratio }] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 저장된 설정(unknown)에서 아는 필드만 꺼낸다. Studio 편집의 시작값이다. */
export function parsePageTheme(value: unknown): PageTheme {
  const source = isRecord(value) ? value : {};
  const colors: PageThemeColors = {};
  if (isRecord(source.colors)) {
    for (const key of PAGE_THEME_COLOR_KEYS) {
      const color = source.colors[key];
      if (typeof color === "string" && color) colors[key] = color;
    }
  }
  const copy: PageThemeCopy = {};
  if (isRecord(source.copy)) {
    for (const key of PAGE_THEME_COPY_KEYS) {
      const text = source.copy[key];
      if (typeof text === "string" && text) copy[key] = text;
    }
  }
  const branding = isRecord(source.branding) ? source.branding : {};
  return {
    schemaVersion: 1,
    colors,
    font: (PAGE_THEME_FONTS as readonly string[]).includes(source.font as string) ? (source.font as PageThemeFont) : undefined,
    logoAssetId: typeof source.logoAssetId === "string" && source.logoAssetId ? source.logoAssetId : undefined,
    backgroundAssetId:
      typeof source.backgroundAssetId === "string" && source.backgroundAssetId ? source.backgroundAssetId : undefined,
    copy,
    branding: {
      hideHarucutBranding: branding.hideHarucutBranding === true,
      outputLogo: branding.outputLogo === "ORGANIZER_LOGO" ? "ORGANIZER_LOGO" : "NONE",
    },
  };
}

/**
 * PATCH 에 실을 모양. 빈 문구·빈 색·기본 브랜딩은 뺀다(서버가 기본값을 채운다). 아무것도 없으면 null —
 * 「테마 없음」으로 되돌린다.
 */
export function compactPageTheme(theme: PageTheme): PageTheme | null {
  const colors = Object.fromEntries(
    Object.entries(theme.colors ?? {}).filter(([, v]) => typeof v === "string" && v.trim()),
  ) as PageThemeColors;
  const copy = Object.fromEntries(
    Object.entries(theme.copy ?? {})
      .map(([k, v]) => [k, typeof v === "string" ? v.trim() : ""])
      .filter(([, v]) => v),
  ) as PageThemeCopy;
  const branding: PageThemeBranding = {};
  if (theme.branding?.hideHarucutBranding) branding.hideHarucutBranding = true;
  if (theme.branding?.outputLogo === "ORGANIZER_LOGO") branding.outputLogo = "ORGANIZER_LOGO";

  const out: PageTheme = { schemaVersion: 1 };
  if (Object.keys(colors).length) out.colors = colors;
  if (theme.font) out.font = theme.font;
  if (theme.logoAssetId) out.logoAssetId = theme.logoAssetId;
  if (theme.backgroundAssetId) out.backgroundAssetId = theme.backgroundAssetId;
  if (Object.keys(copy).length) out.copy = copy;
  if (Object.keys(branding).length) out.branding = branding;
  return Object.keys(out).length > 1 ? out : null;
}
