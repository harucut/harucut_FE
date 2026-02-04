"use client";

import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import type { ThemeDraft } from "@/lib/themeDraftStore";

type FramePickerProps = {
  selectedFrameId: FrameId;
  onChangeSelected: (id: FrameId) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  drafts?: ThemeDraft[];
  selectedDraftId?: string | null;
  onSelectDraft?: (id: string | null) => void;
};

export function FramePicker({
  selectedFrameId,
  onChangeSelected,
  onConfirm,
  confirmLabel = "선택한 프레임으로 진행하기",
  drafts = [],
  selectedDraftId = null,
  onSelectDraft,
}: FramePickerProps) {
  const draftOptions = drafts.filter((d) => d.frameId === selectedFrameId);

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

      {onSelectDraft ? (
        <section className="mt-4 flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-zinc-200">
              저장된 꾸민 프레임 (선택 시 적용)
            </h3>
            <button
              type="button"
              onClick={() => onSelectDraft(null)}
              className="text-[10px] text-zinc-400 underline underline-offset-4"
            >
              선택 해제
            </button>
          </div>
          {draftOptions.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              저장된 꾸민 프레임이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {draftOptions.map((draft) => {
                const isActive = draft.id === selectedDraftId;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() =>
                      onSelectDraft(
                        isActive && selectedDraftId === draft.id
                          ? null
                          : draft.id,
                      )
                    }
                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "border-emerald-400/80 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                    }`}
                  >
                    <p className="text-xs font-semibold text-zinc-100 truncate">
                      {draft.name}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {new Date(draft.savedAt).toLocaleString("ko-KR")}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

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
