"use client";

import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import { FRAME_CATALOG } from "@/lib/frameCatalog";

type FramePickerLayoutMode = "carousel" | "grid";

const FRAME_PICKER_PREVIEW_VIEWPORT =
  "flex h-[176px] w-[132px] items-center justify-center";
const PREVIEW_BORDER_COLOR = "var(--hc-frame-picker-preview-outer)";
const PREVIEW_SLOT_COLOR = "var(--hc-frame-picker-preview-inner)";

type FramePickerProps = {
  selectedFrameId: FrameId;
  onChangeSelected: (id: FrameId) => void;
  onConfirm: () => void;
  confirmLabel?: string;
};

export function FramePicker({
  selectedFrameId,
  onChangeSelected,
  onConfirm,
  confirmLabel = "선택한 프레임으로 진행하기",
}: FramePickerProps) {
  const [layoutMode, setLayoutMode] = useState<FramePickerLayoutMode>("grid");

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-zinc-500">
            프레임 보기 방식
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLayoutMode("grid")}
              className="hc-button-secondary rounded-full border px-3 py-1.5 text-[11px] font-semibold"
            >
              <span
                className={
                  layoutMode === "grid"
                    ? "text-[color:var(--hc-primary)]"
                    : "text-zinc-400"
                }
              >
                2열 그리드
              </span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode("carousel")}
              className="hc-button-secondary rounded-full border px-3 py-1.5 text-[11px] font-semibold"
            >
              <span
                className={
                  layoutMode === "carousel"
                    ? "text-[color:var(--hc-primary)]"
                    : "text-zinc-400"
                }
              >
                가로 카드
              </span>
            </button>
          </div>
        </div>

        {layoutMode === "grid" ? (
          <div className="grid grid-cols-2 gap-4">
            {FRAME_CONFIGS.map((frame) => (
              <FramePickerCard
                key={frame.id}
                frameId={frame.id}
                frameName={frame.name}
                selected={frame.id === selectedFrameId}
                onClick={() => onChangeSelected(frame.id)}
              />
            ))}
          </div>
        ) : (
          <div>
            <div
              className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{
                paddingInlineStart:
                  "max(0.75rem, calc((100% - min(78vw, 20rem)) / 2))",
                paddingInlineEnd:
                  "max(0.75rem, calc((100% - min(78vw, 20rem)) / 2))",
                scrollPaddingInlineStart:
                  "max(0.75rem, calc((100% - min(78vw, 20rem)) / 2))",
                scrollPaddingInlineEnd:
                  "max(0.75rem, calc((100% - min(78vw, 20rem)) / 2))",
              }}
            >
              <div className="flex snap-x snap-mandatory gap-4">
                {FRAME_CONFIGS.map((frame) => (
                  <FramePickerCard
                    key={frame.id}
                    frameId={frame.id}
                    frameName={frame.name}
                    selected={frame.id === selectedFrameId}
                    onClick={() => onChangeSelected(frame.id)}
                    mode="carousel"
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={onConfirm}
          className="hc-button-primary rounded-full px-5 py-2.5 text-xs font-semibold"
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}

function FramePickerCard({
  frameId,
  frameName,
  selected,
  onClick,
  mode = "grid",
}: {
  frameId: FrameId;
  frameName: string;
  selected: boolean;
  onClick: () => void;
  mode?: FramePickerLayoutMode;
}) {
  const meta = FRAME_CATALOG.find((item) => item.id === frameId);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative overflow-hidden rounded-[28px] border p-3 text-left transition-all",
        mode === "grid"
          ? "w-full"
          : "w-[min(78vw,320px)] shrink-0 snap-center sm:w-[320px]",
        selected
          ? "border-[color:var(--hc-primary)] bg-zinc-900 shadow-[0_0_0_1px_var(--hc-accent-soft-border)]"
          : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900",
      ].join(" ")}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
          meta?.surfaceClassName ?? "from-white/5 to-transparent"
        }`}
      />

      <div className="relative flex flex-col gap-3">
        <div
          className={[
            "flex items-center justify-center rounded-2xl border border-white/10 bg-black/20",
            mode === "grid" ? "min-h-[220px] p-3" : "min-h-[220px] p-4",
          ].join(" ")}
        >
          <div className={FRAME_PICKER_PREVIEW_VIEWPORT}>
            <FramePreview
              frameId={frameId}
              className="max-h-full max-w-full"
              borderColor={PREVIEW_BORDER_COLOR}
              slotColor={PREVIEW_SLOT_COLOR}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-50">{frameName}</p>
          <span
            className={[
              "inline-flex h-6 w-6 items-center justify-center rounded-full border",
              selected
                ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-primary)] text-[color:var(--hc-primary-contrast)]"
                : "border-white/10 bg-black/20 text-zinc-400",
            ].join(" ")}
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          </span>
        </div>
      </div>
    </button>
  );
}
