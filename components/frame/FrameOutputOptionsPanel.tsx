"use client";

import { BORDER_COLORS } from "@/constants/colors";
import { normalizeHexColor } from "@/lib/themeBackground";

type FrameOutputOptionsPanelProps = {
  borderColor: string;
  onBorderColorChange: (color: string) => void;
  includeVideo: boolean;
  onIncludeVideoChange: (value: boolean) => void;
  hasCustomFrame: boolean;
  videoEligible: boolean;
  remainingVideoConversions: number;
};

export function FrameOutputOptionsPanel({
  borderColor,
  onBorderColorChange,
  includeVideo,
  onIncludeVideoChange,
  hasCustomFrame,
  videoEligible,
  remainingVideoConversions,
}: FrameOutputOptionsPanelProps) {
  const canEnableVideo = videoEligible && remainingVideoConversions > 0;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xs font-medium text-zinc-200">출력 옵션</h2>
            <p className="mt-1 text-[11px] text-zinc-500">
              다음 단계에서 이미지와 동영상을 미리 생성한 뒤 다운로드할 수 있어요.
            </p>
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
                      "h-8 rounded-full border px-3 text-[11px]",
                      borderColor === color.value
                        ? "border-emerald-400 text-emerald-200"
                        : "border-zinc-700 text-zinc-300",
                    ].join(" ")}
                  >
                    {color.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={normalizeHexColor(borderColor)}
                  onChange={(e) => onBorderColorChange(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-950"
                />
                <input
                  value={borderColor}
                  onChange={(e) => onBorderColorChange(normalizeHexColor(e.target.value))}
                  className="h-9 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-[11px] text-zinc-200"
                  placeholder="#18181b"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="inline-flex items-start gap-2 text-[11px] text-zinc-200">
            <input
              type="checkbox"
              checked={includeVideo}
              onChange={(e) => onIncludeVideoChange(e.target.checked)}
              disabled={!canEnableVideo && !includeVideo}
              className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-0 disabled:opacity-40"
            />
            <span className="flex flex-col gap-1">
              <span>동영상도 함께 준비하기</span>
              <span className="text-zinc-500">
                {videoEligible
                  ? `남은 동영상 변환 횟수 ${remainingVideoConversions}회`
                  : "선택한 결과로는 동영상을 만들 수 없어요."}
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
