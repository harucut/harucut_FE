"use client";

import { createContext, useContext, useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { eventFontClassName } from "@/lib/event/eventFonts";
import {
  contrastRatio,
  isHexColor,
  pageThemeCopy,
  pageThemeStyle,
  safeAssetUrl,
  type PageThemeCopyKey,
  type ResolvedPageTheme,
} from "@/lib/event/pageTheme";

const EventThemeContext = createContext<ResolvedPageTheme | null>(null);

/** 상태바·주소창 색. 화면을 떠나면 원래 값으로 돌려놓는다. 개인 테마 설정은 건드리지 않는다. */
export function useMetaThemeColor(color?: string | null) {
  useEffect(() => {
    if (!color) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = color;
    return () => {
      meta.content = previous;
    };
  }, [color]);
}

/**
 * 행사 화면(/e · /booth · /r)의 바탕. 게시된 행사 테마의 색 · 배경을 `.ev-surface` 토큰 위에 얹는다.
 * 테마를 아직 못 받았거나 없으면 globals.css 의 중립 기본값 그대로다.
 *
 * 글꼴은 행사 이름과 큰 버튼에만 쓴다(EventTitle · EventButton). 본문·동의문·오류까지 명조나 두꺼운 제목체로
 * 칠하면 13px 안내가 읽히지 않는다 — 읽어야 하는 글은 기본 서체로 둔다.
 *
 * 배경 그림은 페이지가 아니라 뒤의 고정 층에 깐다. 페이지 높이가 바뀌어도 그림이 늘어나거나 흔들리지 않는다.
 * 그림 위에 놓이는 글은 `.ev-readable` 패널에 담아 읽히게 한다(`data-has-bg`).
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
  const { backgroundImage, backgroundSize, backgroundPosition, ...style } = pageThemeStyle(theme);
  const bg = theme?.colors?.bg;
  // 어두운 테마에서 네이티브 입력·스크롤바가 밝게 뜨지 않게 한다.
  const dark = isHexColor(bg) && (contrastRatio(bg, "#FFFFFF") ?? 0) > (contrastRatio(bg, "#000000") ?? 0);
  useMetaThemeColor(isHexColor(bg) ? bg : null);
  return (
    <EventThemeContext.Provider value={theme ?? null}>
      <main
        data-has-bg={backgroundImage ? "" : undefined}
        className={["ev-surface isolate", className].filter(Boolean).join(" ")}
        style={{ ...style, colorScheme: dark ? "dark" : "light" }}
      >
        {backgroundImage ? (
          <div aria-hidden className="fixed inset-0 -z-10" style={{ backgroundImage, backgroundSize, backgroundPosition }} />
        ) : null}
        {children}
      </main>
    </EventThemeContext.Provider>
  );
}

function useEventFont() {
  return eventFontClassName(useContext(EventThemeContext)?.font);
}

/** 행사 이름. 화면에서 행사 글꼴이 가장 크게 드러나는 자리다. */
export function EventTitle({ className = "text-[clamp(1.875rem,8.6vw,2.5rem)]", children }: { className?: string; children: ReactNode }) {
  const font = useEventFont();
  return (
    <h1 className={["break-keep font-extrabold leading-[1.2] tracking-[-0.02em] text-balance", font, className].filter(Boolean).join(" ")}>
      {children}
    </h1>
  );
}

/** 주최자 문구가 있으면 그것, 없으면 기본 문구. */
export function useEventCopy(key: PageThemeCopyKey, fallback: string) {
  return pageThemeCopy(useContext(EventThemeContext), key, fallback);
}

/** 주최자 로고. 없으면 아무것도 그리지 않는다. 서명 URL 이라 Referer 를 보내지 않는다. */
export function EventLogo({ className = "h-10 w-auto max-w-[60%] self-start object-contain" }: { className?: string }) {
  const url = safeAssetUrl(useContext(EventThemeContext)?.logoUrl);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="행사 로고" referrerPolicy="no-referrer" className={className} />;
}

const BUTTON_TONE = {
  primary: "bg-(--ev-accent) font-extrabold text-(--ev-accent-contrast)",
  quiet: "border border-(--ev-border) bg-(--ev-card) font-bold text-(--ev-text)",
} as const;

const BUTTON_SIZE = {
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-6 text-[16px]",
  xl: "h-16 px-6 text-[18px]",
  // 부스는 팔 길이 밖에서도 읽혀야 한다. 화면의 짧은 변을 따라 커진다.
  booth: "h-[clamp(5rem,11vmin,7.5rem)] px-8 text-[clamp(1.5rem,3.8vmin,2.5rem)]",
} as const;

/** 행사 화면의 버튼. 색은 전부 행사 테마 토큰이라 주최자 색을 따른다. 누를 것은 알약이다. */
export function EventButton({
  tone = "primary",
  size = "lg",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof BUTTON_TONE;
  size?: keyof typeof BUTTON_SIZE;
}) {
  const font = useEventFont();
  return (
    <button
      type={type}
      className={[
        "inline-flex w-full shrink-0 touch-manipulation items-center justify-center gap-2 rounded-full transition-opacity duration-150 enabled:hover:opacity-90 disabled:opacity-40",
        BUTTON_TONE[tone],
        BUTTON_SIZE[size],
        tone === "primary" ? font : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

/**
 * 화면 아래에 붙는 주 동작 자리. 사람은 휴대폰을 한 손으로 들고 엄지로 누른다 — 위쪽 버튼은 닿지 않고,
 * 내용이 길어 스크롤해도 버튼을 잃지 않는다. 내용이 밑으로 들어갈 때는 바탕색으로 흐려진다.
 */
export function EventActionBar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={[
        "sticky bottom-0 z-10 mt-auto flex w-full flex-col gap-2.5 bg-linear-to-t from-(--ev-bg) from-85% to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-8",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
