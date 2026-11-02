"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { StudioSectionId } from "@/lib/studio/eventSections";

export type StudioSectionNavItem = {
  id: StudioSectionId;
  label: string;
  /** 게시 전에 손봐야 하는 구역. 점으로 표시한다. */
  attention?: boolean;
};

/** 구역으로 부드럽게 옮긴다. 동작 줄이기면 바로 간다. 가는 곳은 구역의 scroll-margin 이 고정 바를 비켜 준다. */
export function scrollToStudioSection(id: StudioSectionId) {
  const element = document.getElementById(id);
  if (!element) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  element.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  window.history.replaceState(null, "", `#${id}`);
}

/** 앵커 링크의 기본 이동 대신 부드럽게 옮긴다. 수정 키를 누른 클릭(새 탭)은 브라우저에 맡긴다. */
export function onStudioSectionLink(event: MouseEvent<HTMLAnchorElement>, id: StudioSectionId) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  scrollToStudioSection(id);
}

/**
 * 행사 화면의 목차. 넓은 화면에서는 왼쪽 레일, 좁은 화면에서는 위에 붙는 가로 칩이다 — 요소는 하나고 배치만 바뀐다.
 * 지금 읽는 구역을 화면 위쪽 1/3 띠로 판정한다. 관찰자가 없는 환경에서는 강조 없이 링크로만 쓴다.
 */
export function StudioSectionNav({ items, header }: { items: StudioSectionNavItem[]; header?: ReactNode }) {
  const [active, setActive] = useState<StudioSectionId | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const ids = items.map((item) => item.id).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id as StudioSectionId);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  // 좁은 화면에서 지금 칩이 보이게 가로로 민다. 페이지 세로 위치는 건드리지 않는다.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active) return;
    const current = list.querySelector<HTMLElement>('[aria-current="location"]');
    if (current && list.scrollWidth > list.clientWidth) {
      list.scrollTo?.({ left: current.offsetLeft - 16, behavior: "smooth" });
    }
  }, [active]);

  return (
    <nav
      aria-label="행사 설정 목차"
      className="sticky top-0 z-20 -mx-4 min-w-0 border-b border-(--hc-border) bg-(--hc-surface-soft) backdrop-blur-xl lg:top-36 lg:mx-0 lg:flex lg:flex-col lg:gap-2 lg:self-start lg:border-0 lg:bg-transparent lg:backdrop-blur-none"
    >
      {header ? <div className="hidden lg:block">{header}</div> : null}
      <ul
        ref={listRef}
        className="relative flex gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              onClick={(event) => onStudioSectionLink(event, item.id)}
              className="flex h-11 items-center justify-between gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium text-(--hc-muted) transition hover:text-(--hc-text) aria-[current=location]:bg-(--hc-surface-well) aria-[current=location]:font-bold aria-[current=location]:text-(--hc-text) lg:rounded-xl lg:text-[14px]"
            >
              {item.label}
              {item.attention ? (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--hc-danger)" />
                  <span className="sr-only">확인이 필요해요</span>
                </>
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
