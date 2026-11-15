"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";

type Hsv = { h: number; s: number; v: number };

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** '#rrggbb'·'rrggbb' → HSV(h 0~360, s·v 0~1). 읽지 못하면 잉크(#18181a)로 본다. */
export function hexToHsv(hex: string): Hsv {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? "18181a";
  const n = Number.parseInt(clean, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

/** HSV → '#rrggbb'. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((part) => Math.round((part + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** 화살표 한 번에 움직이는 양. Shift 를 누르면 다섯 배. */
const STEP = 0.02;
const HUE_STEP = 4;

/**
 * 「다른 색」 창(2026-11-15 「색 맘대로 하는 거 창도 디자인 보여줘봐」).
 *
 * 견본 다섯 개에 없는 색은 여기서 고른다. 예전에는 기기의 색 고르기 창(`<input type="color">`)을 그대로 열었다 —
 * iOS·안드로이드·PC 가 저마다 다르게 생겼고 우리 화면과도 따로 놀았다. 이제 어디서나 같은 창이다.
 *
 * 위는 넓은 칸(가로 채도, 세로 밝기), 아래는 색상 띠다. 손가락으로 끌거나 눌러 고르고, 키보드로는 화살표로 움직인다
 * (Shift 는 크게). 고른 색은 제목 옆 동그라미가 바로 보여 준다. 색 코드 입력칸은 두지 않는다 — 색은 보고 고른다
 * (2026-11-14 결정). 「이 색으로」를 눌러야 바뀐다 — 끄는 동안마다 바꾸면 편집기의 되돌리기 이력이 끈 만큼 쌓인다.
 * 닫는 길은 셋이다 — 취소 · 배경 누르기 · Escape(useModalDialog).
 */
export function CustomColorSheet({
  initial,
  onClose,
  onPick,
}: {
  /** 처음 보여 줄 색('#' 있든 없든). 지금 고른 색이다. */
  initial: string;
  onClose: () => void;
  /** 「이 색으로」 — '#rrggbb'. */
  onPick: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(initial));
  const dialogRef = useModalDialog(true, onClose);
  const titleId = useId();
  const color = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  const pickArea = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setHsv((prev) => ({
      ...prev,
      s: clamp((event.clientX - rect.left) / rect.width),
      v: 1 - clamp((event.clientY - rect.top) / rect.height),
    }));
  };
  const pickHue = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setHsv((prev) => ({ ...prev, h: clamp((event.clientX - rect.left) / rect.width) * 359.9 }));
  };
  // 누른 채 칸 밖으로 나가도 계속 따라오게 포인터를 잡는다.
  const startDrag = (pick: (event: PointerEvent<HTMLDivElement>) => void) => (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pick(event);
  };
  const followDrag = (pick: (event: PointerEvent<HTMLDivElement>) => void) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) pick(event);
  };

  const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP * 5 : STEP;
    const delta: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    setHsv((prev) => ({ ...prev, s: clamp(prev.s + move[0]), v: clamp(prev.v + move[1]) }));
  };
  const onHueKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? HUE_STEP * 5 : HUE_STEP;
    const move = event.key === "ArrowRight" || event.key === "ArrowUp" ? step : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step : 0;
    if (!move) return;
    event.preventDefault();
    setHsv((prev) => ({ ...prev, h: (prev.h + move + 360) % 360 }));
  };

  const thumb = "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]";

  return (
    <div className="fixed inset-0 z-120 flex items-end justify-center hc-modal px-4 py-6 sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="hc-surface-card relative flex w-full max-w-sm flex-col gap-4 rounded-3xl border p-5 shadow-(--hc-card-shadow)"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-[18px] font-extrabold">
            다른 색
          </h2>
          {/* 고른 색. 끄는 동안 그대로 따라온다. */}
          <span aria-hidden className="size-10 rounded-full border border-black/10" style={{ backgroundColor: color }} />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="채도와 밝기"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          aria-valuetext={`채도 ${Math.round(hsv.s * 100)}%, 밝기 ${Math.round(hsv.v * 100)}%`}
          onPointerDown={startDrag(pickArea)}
          onPointerMove={followDrag(pickArea)}
          onKeyDown={onAreaKey}
          className="relative h-44 w-full cursor-crosshair touch-none rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hc-text)"
          style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hueColor})` }}
        >
          <span className={`${thumb} size-6`} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: color }} />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="색상"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={startDrag(pickHue)}
          onPointerMove={followDrag(pickHue)}
          onKeyDown={onHueKey}
          className="relative h-7 w-full cursor-pointer touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--hc-text)"
          style={{ background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" }}
        >
          <span className={`${thumb} top-1/2 size-7`} style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }} />
        </div>

        <div className="mt-1 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="hc-button-secondary h-12 flex-1 rounded-full border text-[14px] font-bold"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onPick(color);
              onClose();
            }}
            className="hc-button-primary h-12 flex-1 rounded-full text-[14px] font-extrabold"
          >
            이 색으로
          </button>
        </div>
      </div>
    </div>
  );
}
