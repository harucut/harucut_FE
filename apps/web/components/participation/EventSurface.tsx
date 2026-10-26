"use client";

import { createContext, useContext, type ReactNode } from "react";
import { eventFontClassName } from "@/lib/event/eventFonts";
import {
  pageThemeCopy,
  pageThemeStyle,
  safeAssetUrl,
  type PageThemeCopyKey,
  type ResolvedPageTheme,
} from "@/lib/event/pageTheme";

const EventThemeContext = createContext<ResolvedPageTheme | null>(null);

/**
 * 행사 화면(/e · /booth · /r)의 바탕. 게시된 행사 테마의 색 · 글꼴 · 배경을 `.ev-surface` 토큰 위에 얹는다.
 * 테마를 아직 못 받았거나 없으면 globals.css 의 중립 기본값 그대로다.
 */
export function EventSurface({
  theme,
  className,
  children,
}: {
  theme?: ResolvedPageTheme | null;
  className?: string;
  children: ReactNode;
}) {
  const font = eventFontClassName(theme?.font);
  return (
    <EventThemeContext.Provider value={theme ?? null}>
      <main className={["ev-surface", font, className].filter(Boolean).join(" ")} style={pageThemeStyle(theme)}>
        {children}
      </main>
    </EventThemeContext.Provider>
  );
}

/** 주최자 문구가 있으면 그것, 없으면 기본 문구. */
export function useEventCopy(key: PageThemeCopyKey, fallback: string) {
  return pageThemeCopy(useContext(EventThemeContext), key, fallback);
}

/** 주최자 로고. 없으면 아무것도 그리지 않는다. 서명 URL 이라 Referer 를 보내지 않는다. */
export function EventLogo({ className = "h-12 w-auto max-w-[60%] self-start object-contain" }: { className?: string }) {
  const url = safeAssetUrl(useContext(EventThemeContext)?.logoUrl);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="행사 로고" referrerPolicy="no-referrer" className={className} />;
}
