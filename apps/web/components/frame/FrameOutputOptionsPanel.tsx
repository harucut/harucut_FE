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
  includeVideo: boolean;
  onIncludeVideoChange: (value: boolean) => void;
  hasCustomFrame: boolean;
  videoEligible: boolean;
  remainingVideoConversions: number;
  /** 무제한 요금제면 남은 횟수 대신 '무제한'으로 표기 */
  unlimitedVideoConversions?: boolean;
  guestMode?: boolean;
};

export function FrameOutputOptionsPanel({
  borderColor,
  onBorderColorChange,
  outputFilter,
  onOutputFilterChange,
  includeVideo,
  onIncludeVideoChange,
  hasCustomFrame,
  videoEligible,
  remainingVideoConversions,
  unlimitedVideoConversions = false,
  guestMode = false,
}: FrameOutputOptionsPanelProps) {
  const canEnableVideo =
    videoEligible && (unlimitedVideoConversions || remainingVideoConversions > 0);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xs font-medium text-zinc-200">출력 옵션</h2>
          </div>

          {hasCustomFrame ? (
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
              미리보기와 최종 이미지, 동영상에 같은 필터가 적용돼요.
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
                <span className="mt-1 block text-[10px] text-zinc-400">
                  {filter.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {guestMode ? null : (
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-start gap-2 text-[11px] text-zinc-200">
              <input
                type="checkbox"
                checked={includeVideo}
                onChange={(e) => onIncludeVideoChange(e.target.checked)}
                disabled={!canEnableVideo && !includeVideo}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-[color:var(--hc-primary)] focus:ring-0 disabled:opacity-40"
              />
              <span className="flex flex-col gap-1">
                <span>동영상도 함께 준비하기</span>
                <span className="text-zinc-500">
                  {videoEligible
                    ? unlimitedVideoConversions
                      ? "남은 동영상 변환 횟수 무제한"
                      : `남은 동영상 변환 횟수 ${remainingVideoConversions}회`
                    : "선택한 결과로는 동영상을 만들 수 없어요."}
                </span>
              </span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
