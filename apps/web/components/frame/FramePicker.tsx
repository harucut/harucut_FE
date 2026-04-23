"use client";

import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import { FRAME_CATALOG } from "@/lib/frameCatalog";

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
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
          {FRAME_CONFIGS.map((frame) => {
            const isSelected = frame.id === selectedFrameId;
            const meta = FRAME_CATALOG.find((item) => item.id === frame.id);

            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => onChangeSelected(frame.id)}
                className={[
                  "group relative overflow-hidden rounded-[28px] border px-3 py-3 text-left transition-all",
                  isSelected
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
                  <div>
                    <span className="inline-flex rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] text-zinc-100">
                      {meta?.badge ?? "FRAME"}
                    </span>
                    <p className="mt-2 text-sm font-semibold text-zinc-50">
                      {frame.name}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {meta?.shortLabel ?? "FRAME"}
                    </p>
                  </div>

                  <div className="flex h-[200px] w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-3">
                    <FramePreview frameId={frame.id} className="" />
                  </div>

                  {meta ? (
                    <div className="flex flex-wrap gap-1.5">
                      {meta.recommendedFor.slice(0, 2).map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-zinc-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
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
