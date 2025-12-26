"use client";

import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";

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
  confirmLabel = "이 프레임으로 진행하기",
}: FramePickerProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium text-zinc-300">프레임 선택</h2>

        <div className="grid grid-cols-2 gap-4">
          {FRAME_CONFIGS.map((frame) => {
            const isSelected = frame.id === selectedFrameId;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => onChangeSelected(frame.id)}
                className={[
                  "flex flex-col items-center gap-2 rounded-2xl px-3 py-3 transition-colors",
                  isSelected
                    ? "bg-zinc-900 border border-emerald-400/80"
                    : "bg-zinc-900/60 border border-zinc-800 hover:border-zinc-600",
                ].join(" ")}
              >
                <span className="text-[11px] font-medium text-zinc-100">
                  {frame.name}
                </span>
                <div className="flex h-[200px] w-full items-center justify-center">
                  <FramePreview frameId={frame.id} className="" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );
}
