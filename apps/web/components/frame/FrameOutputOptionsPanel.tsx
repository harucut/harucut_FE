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
  /**
   * 결과물을 서버가 그리는가(=로그인 사용자).
   *
   * 서버 합성은 배경을 **프레임에 저장된 값**으로만 칠한다 — 합성 요청에 색을 실을 자리가
   * 없다. 그래서 색을 고르게 두면 미리보기만 바뀌고 저장본은 그대로인, 사용자가 알 수 없는
   * 거짓말이 된다. 고르지 못하게 막고 이유를 말한다.
   */
  serverComposed?: boolean;
};

export function FrameOutputOptionsPanel({
  borderColor,
  onBorderColorChange,
  outputFilter,
  onOutputFilterChange,
  hasCustomFrame,
  serverComposed = false,
}: FrameOutputOptionsPanelProps) {
  const backgroundLocked = hasCustomFrame || serverComposed;
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xs font-medium text-zinc-200">출력 옵션</h2>
          </div>

          {backgroundLocked ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[11px] text-zinc-400">
              {hasCustomFrame
                ? "꾸민 프레임을 선택해서 배경 색상은 프레임 설정을 그대로 사용해요."
                : "배경 색상은 프레임에 저장된 값을 그대로 사용해요. 원하는 색으로 바꾸려면 프레임 꾸미기에서 배경색을 정해 저장한 뒤 그 프레임으로 찍어 주세요."}
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
                      "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[11px]",
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
                  value={normalizeHexColor(borderColor)}
                  onChange={(e) => onBorderColorChange(e.target.value)}
                  className="hc-input h-9 w-12 rounded-lg border"
                />
                <input
                  value={borderColor}
                  onChange={(e) => onBorderColorChange(normalizeHexColor(e.target.value))}
                  className="hc-input h-9 flex-1 rounded-lg border px-3 text-[11px]"
                  placeholder="#23262d"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <h3 className="text-xs font-medium text-zinc-200">보정 필터</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
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
                  "rounded-2xl border px-3 py-2 text-left transition-colors",
                  outputFilter === filter.id
                    ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)]"
                    : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500",
                ].join(" ")}
              >
                <span className="block text-[11px] font-semibold text-zinc-100">
                  {filter.label}
                </span>
                <span className="mt-1 block text-[11px] text-zinc-400">
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
