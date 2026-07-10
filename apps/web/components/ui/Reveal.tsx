"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 뷰포트에 들어오면 한 번 페이드-업으로 나타나는 래퍼. IntersectionObserver 기반이라
 * 스크롤 위치와 무관하게 자연스럽게 동작하고, prefers-reduced-motion은 globals.css에서 존중된다.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "span";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;

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
  }, [shown]);

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
