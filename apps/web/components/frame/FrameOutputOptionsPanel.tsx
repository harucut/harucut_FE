"use client";

import { BORDER_COLORS } from "@/constants/colors";
import {
  FOURCUT_FILTERS,
  type FourcutFilterId,
} from "@/lib/frameFilters";
import { normalizeHexColor } from "@/lib/themeBackground";

type FrameOutputOptionsPanelProps = {
  borderColor: string;
  onBorderColorChange: (color: string) => void;
  outputFilter: FourcutFilterId;
  onOutputFilterChange: (filter: FourcutFilterId) => void;
  hasCustomFrame: boolean;
};

export function FrameOutputOptionsPanel({
  borderColor,
  onBorderColorChange,
  outputFilter,
  onOutputFilterChange,
  hasCustomFrame,
}: FrameOutputOptionsPanelProps) {
  // 회원도 색을 고를 수 있다 — 서버 합성이 `ComposeRequest.backgroundColor` 를 받는다.
  // 잠기는 것은 꾸민 프레임뿐이다. 그 배경은 프레임에 저장돼 있고 이미지일 수도 있다.
  const backgroundLocked = hasCustomFrame;
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xs font-medium text-zinc-200">출력 옵션</h2>
          </div>

          {backgroundLocked ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
              꾸민 프레임을 선택해서 배경 색상은 프레임 설정을 그대로 사용해요.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {BORDER_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => onBorderColorChange(color.value)}
                    className={[
                      "inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-[12px]",
                      borderColor === color.value
                        ? "border-[color:var(--hc-primary)] text-[color:var(--hc-primary-strong)]"
                        : "border-zinc-700 text-zinc-300",
                    ].join(" ")}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ backgroundColor: color.value }}
                    />
                    <span>{color.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="배경색 고르기"
                  value={normalizeHexColor(borderColor)}
                  onChange={(e) => onBorderColorChange(e.target.value)}
                  className="hc-input h-11 w-12 shrink-0 rounded-lg border"
                />
                <input
                  aria-label="배경색 HEX 코드"
                  value={borderColor}
                  onChange={(e) => onBorderColorChange(normalizeHexColor(e.target.value))}
                  className="hc-input h-11 min-w-0 flex-1 rounded-lg border px-3 font-mono text-[13px] tracking-[0.06em]"
                  placeholder="#23262d"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={7}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-xs font-medium text-zinc-200">보정 필터</h3>
            <p className="mt-1 text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
              고른 보정 필터는 미리보기와 최종 이미지에 똑같이 적용돼요.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {FOURCUT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onOutputFilterChange(filter.id)}
                className={[
                  "min-h-[44px] rounded-2xl border px-3 py-2.5 text-left transition-colors",
                  outputFilter === filter.id
                    ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)]"
                    : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500",
                ].join(" ")}
              >
                <span className="block text-[12px] font-semibold text-zinc-100">
                  {filter.label}
                </span>
                <span className="mt-1 block text-[12px] text-zinc-400">
                  {filter.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
