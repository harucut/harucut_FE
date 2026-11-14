"use client";

import { Check } from "lucide-react";
import { BACKGROUND_COLORS } from "@/constants/colors";

/** 고른 견본의 테두리. 견본과 사이를 띄워 밝은 색·어두운 색 어디서나 보인다. 보정 견본도 같은 표시를 쓴다. */
export const SWATCH_SELECTED_RING = "outline-2 outline-offset-2 outline-(--hc-text)";
/** 목록에 없는 색을 고르는 견본. 무지개로 「아무 색이나」를 말한다. */
const RAINBOW =
  "conic-gradient(from 90deg, #ff5f5f, #ffbf4d, #f6f05a, #5fd38a, #4db8ff, #8a6bff, #ff5fc8, #ff5f5f)";

/** 밝은 색 위에는 어두운 체크, 어두운 색 위에는 흰 체크. */
function SelectedCheck({ hex }: { hex: string }) {
  const n = Number.parseInt(hex, 16);
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return <Check aria-hidden strokeWidth={3} className={`size-4 ${luma > 150 ? "text-[#14140F]" : "text-white"}`} />;
}

/**
 * 동그란 색 견본 열한 개 + 맨 끝 「다른 색」(2026-11-09 편집기, 2026-11-14 사진 고르기도).
 *
 * 견본은 44px 다 — 터치 화면의 최소 높이(globals.css)에 못 미치면 세로로 늘어나 타원이 된다. 이름은 화면에
 * 쓰지 않고 읽기 프로그램·툴팁에만 준다. 목록에 없는 색은 무지개 견본이 기기의 색 고르기 창을 열고,
 * 그 색을 고른 뒤에는 무지개 대신 그 색과 체크로 보인다.
 *
 * `value` 는 '#' 이 있어도 없어도 된다. 고른 색이 없으면(편집기에서 배경 사진을 깔았을 때) null 을 넘겨
 * 어떤 견본도 고른 것처럼 그리지 않는다. `onChange` 는 견본이면 '#' 없는 여섯 자리(BACKGROUND_COLORS 값),
 * 「다른 색」이면 색 고르기 창이 준 '#rrggbb' 를 그대로 넘긴다 — 저장하는 꼴은 부르는 쪽이 맞춘다.
 */
export function ColorSwatches({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (color: string) => void;
}) {
  const current = value == null ? null : value.replace(/^#/, "").toLowerCase();
  const presetSelected = current != null && BACKGROUND_COLORS.some((color) => color.value === current);
  const customSelected = current != null && !presetSelected;

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {BACKGROUND_COLORS.map((color) => {
        const selected = current === color.value;
        return (
          <button
            key={color.id}
            type="button"
            onClick={() => onChange(color.value)}
            aria-pressed={selected}
            aria-label={color.label}
            title={color.label}
            className={`grid size-11 place-items-center rounded-full border border-black/10 transition ${selected ? SWATCH_SELECTED_RING : ""}`}
            style={{ backgroundColor: `#${color.value}` }}
          >
            {selected ? <SelectedCheck hex={color.value} /> : null}
          </button>
        );
      })}
      <span
        title="다른 색"
        className={`relative grid size-11 place-items-center rounded-full border border-black/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-(--hc-text) ${customSelected ? SWATCH_SELECTED_RING : ""}`}
        style={{ background: customSelected ? `#${current}` : RAINBOW }}
      >
        {customSelected ? <SelectedCheck hex={current} /> : null}
        <input
          type="color"
          aria-label="다른 색 고르기"
          value={`#${current ?? "18181a"}`}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
        />
      </span>
    </div>
  );
}
