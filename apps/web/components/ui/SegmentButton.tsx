"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * 둘 중 하나를 고르는 전환 단추의 한 칸. 기록(그리드·달력)·편집기(스티커·텍스트)·사진 고르기(사진·꾸미기)가
 * 같은 모양을 쓴다 — 같은 일을 하는 단추는 화면마다 모양을 바꾸지 않는다.
 *
 * 묶음은 부르는 쪽이 `hc-surface-well inline-flex items-center gap-1 rounded-full p-1` 로 감싼다.
 */
export function SegmentButton({
  active,
  Icon,
  children,
  onClick,
}: {
  active: boolean;
  Icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition ${
        active ? "bg-white text-[#0B0B0C]" : "text-(--hc-muted)"
      }`}
    >
      <Icon aria-hidden className="h-3.75 w-3.75" />
      {children}
    </button>
  );
}
