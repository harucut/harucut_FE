"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type CoachStep = {
  selector: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

// 같은 selector(data-coach)가 모바일·데스크톱에 동시에 존재할 수 있으므로,
// lg:hidden 등으로 숨겨지지 않은(실제로 화면에 보이는) 요소를 고른다.
function findVisibleTarget(selector: string): Element | null {
  const candidates = Array.from(document.querySelectorAll(selector));
  const visible = candidates.find(
    (el) => el instanceof HTMLElement && el.offsetParent !== null,
  );
  return visible ?? candidates[0] ?? null;
}

// 첫 방문 시 1회만 보여주는 스포트라이트 코치마크.
// 각 단계가 실제 버튼(data-coach 등 selector)을 비추며 기능을 설명한다.
export function CoachMarks({ id, steps }: { id: string; steps: CoachStep[] }) {
  const storageKey = `hc-coach-${id}`;
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let done = true;
    try {
      done = Boolean(window.localStorage.getItem(storageKey));
    } catch {
      done = true;
    }
    if (done) return;
    // 버튼이 마운트될 최소 시간만 기다린 뒤, 슬라이드/페이드 없이 즉시 표시
    const timer = window.setTimeout(() => setActive(true), 350);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const measure = useCallback(() => {
    const step = steps[index];
    if (!step) return;
    const el = findVisibleTarget(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [index, steps]);

  useLayoutEffect(() => {
    if (!active) return;
    const step = steps[index];
    const el = step ? findVisibleTarget(step.selector) : null;
    // 이미 화면 안에 있으면 스크롤하지 않는다. 부드러운 스크롤이 도는 동안 스포트라이트가
    // 대상을 따라다니느라 위치가 계속 갱신됐다.
    if (el) {
      const box = el.getBoundingClientRect();
      const inView = box.top >= 0 && box.bottom <= window.innerHeight;
      if (!inView) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    // 스크롤 후 위치를 다시 측정
    const raf = window.requestAnimationFrame(measure);

    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, index, measure, steps]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
    setActive(false);
  }, [storageKey]);

  if (!active) return null;

  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;
  const pad = 8;

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 400;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipTop = rect
    ? Math.min(rect.top + rect.height + 14, viewportH - 190)
    : 96;
  const tooltipLeft = rect
    ? Math.max(12, Math.min(rect.left, viewportW - 312))
    : 12;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="기능 안내" aria-modal="true">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 rounded-2xl"
          /*
            top/left 대신 transform 으로 옮긴다. 코치마크가 뜨는 순간 스포트라이트가
            0.15 의 레이아웃 시프트를 만들고 있었다(실측). transform 은 레이아웃을 건드리지
            않아 시프트로 잡히지 않고, 대상 위치를 다시 재도 화면이 밀리지 않는다.
          */
          style={{
            transform: `translate3d(${rect.left - pad}px, ${rect.top - pad}px, 0)`,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.66)",
            border: "2px solid var(--hc-primary)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/[0.66]" />
      )}

      <div
        className="absolute left-0 top-0 w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border-2 border-[color:var(--hc-border-strong)] bg-[color:var(--hc-surface)] p-4 shadow-2xl"
        style={{
          transform: `translate3d(${tooltipLeft}px, ${tooltipTop}px, 0)`,
          boxShadow: "0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08)",
        }}
      >
        {/* 이 말풍선은 --hc-surface(라이트에서 흰색) 위에 뜬다. --hc-primary(#16b454)는
            흰 배경에서 대비 2.73:1로 AA(4.5:1) 미달이라, 글자에는 -strong을 쓴다. */}
        <p className="text-[11px] font-bold tracking-wide text-[color:var(--hc-primary-strong)]">
          {index + 1} / {steps.length}
        </p>
        <h3 className="mt-1 text-[15px] font-bold text-[color:var(--hc-text)]">
          {step.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-5 text-[color:var(--hc-muted)]">
          {step.body}
        </p>
        <div className="mt-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-[12px] font-medium text-[color:var(--hc-muted)] hover:text-[color:var(--hc-text)]"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
            className="hc-button-primary rounded-full px-4 py-1.5 text-[12px] font-bold"
          >
            {isLast ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
