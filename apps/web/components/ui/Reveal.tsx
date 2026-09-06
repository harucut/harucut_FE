"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 뷰포트에 들어오면 한 번 페이드-업으로 나타나는 래퍼. IntersectionObserver 기반이라
 * 스크롤 위치와 무관하게 자연스럽게 동작하고, prefers-reduced-motion은 globals.css에서 존중된다.
 *
 * `immediate` 는 첫 화면(히어로)용이다. 관찰자를 기다리는 판은 하이드레이션 전까지 opacity 0 이라
 * 헤드라인(LCP)이 JS 가 돌기 전엔 그려지지 않았다. 이 판은 CSS 애니메이션이라 첫 페인트에서 바로
 * 재생되고, 스크롤 위치와 무관하다.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
  immediate = false,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "span" | "li";
  className?: string;
  immediate?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (immediate || !el || shown) return;

    // "use client" 컴포넌트라 이 effect는 브라우저에서만 실행되며, 대상 브라우저에는
    // IntersectionObserver가 항상 존재한다. 뷰포트에 들어오는 콜백에서만 상태를 바꾼다.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, immediate]);

  if (immediate) {
    return (
      <Tag
        ref={ref as never}
        className={`hc-reveal-now ${className}`}
        style={{ "--hc-reveal-delay": `${delay}ms` } as CSSProperties}
      >
        {children}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as never}
      className={`hc-reveal ${shown ? "hc-reveal--in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
