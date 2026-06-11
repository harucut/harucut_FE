"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import type { FrameId } from "@/constants/frames";
import type { FourcutFilterId } from "@/lib/frameFilters";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

type FrameSelectPanelProps = {
  frameId: FrameId | null;
  images?: string[];
  media?: FrameMedia[];
  selectedIndexes: (number | null)[];
  maxSelect: number;
  emptyStateText?: string;
  incompleteButtonLabel?: string;
  nextButtonLabel: string;
  onToggleSelect: (index: number) => void;
  onReset: () => void;
  onNext: () => void;
  renderExtraControls?: () => ReactNode;
  themeData?: ThemeExportJson | null;
  borderColor?: string;
  outputFilter?: FourcutFilterId;
};

export function FrameSelectPanel({
  frameId,
  images,
  media,
  selectedIndexes,
  maxSelect,
  emptyStateText = "선택 가능한 사진이나 영상이 아직 없어요.",
  incompleteButtonLabel,
  nextButtonLabel,
  onToggleSelect,
  onReset,
  onNext,
  renderExtraControls,
  themeData = null,
  borderColor,
  outputFilter = "NONE",
}: FrameSelectPanelProps) {
  const baseItems: FrameMedia[] = useMemo(() => {
    if (media && media.length) return media;
    if (images && images.length) {
      return images.map((src) => ({ type: "image" as const, src }));
    }
    return [];
  }, [images, media]);

  const slotMedia = useMemo(
    () => selectedIndexes.map((idx) => (idx == null ? null : baseItems[idx] ?? null)),
    [baseItems, selectedIndexes],
  );

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );
  const canProceed = selectedCount === maxSelect;

  return (
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section className="flex flex-col gap-3">
        {frameId ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 xl:hidden">
            <p className="text-sm font-semibold text-zinc-100">프레임 미리보기</p>
            <div className="flex justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                className="w-full max-w-[220px]"
              />
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          {baseItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 text-center text-[11px] text-zinc-500">
              {emptyStateText}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-4">
              {baseItems.map((item, index) => {
                const slotIndex = selectedIndexes.indexOf(index);
                const isSelected = slotIndex !== -1;
                const order = slotIndex + 1;

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onToggleSelect(index)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `${index + 1}번 ${item.type === "video" ? "영상" : "사진"} 선택 해제 (현재 ${order}번째로 선택됨)`
                        : `${index + 1}번 ${item.type === "video" ? "영상" : "사진"} 선택`
                    }
                    className={[
                      "group relative aspect-[3/4] overflow-hidden rounded-xl border bg-black text-left transition",
                      isSelected
                        ? "border-[color:var(--hc-primary)] ring-2 ring-[color:var(--hc-accent-soft-border)]"
                        : "border-zinc-700 hover:border-zinc-500",
                    ].join(" ")}
                  >
                    {item.type === "video" ? (
                      <video
                        src={item.src}
                        className="h-full w-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.src}
                        alt={`shot-${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    )}

                    <span className="pointer-events-none absolute left-1 top-1 rounded-full border border-black/10 bg-white px-1.5 py-0.5 text-[9px] font-bold text-black shadow-sm">
                      #{index + 1}
                    </span>

                    {isSelected ? (
                      <span className="pointer-events-none absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--hc-primary)] text-[10px] font-semibold text-[color:var(--hc-primary-contrast)]">
                        {order}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex items-center justify-between text-[11px] text-zinc-400">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex w-fit items-center gap-1 rounded-full border border-zinc-700 px-2.5 py-1.5 text-[10px] text-zinc-400 hover:bg-zinc-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            선택 초기화
          </button>

          <button
            type="button"
            disabled={!canProceed}
            onClick={onNext}
            className="hc-button-primary rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {canProceed ? nextButtonLabel : incompleteButtonLabel ?? nextButtonLabel}
          </button>
        </section>
      </section>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-6">
        {frameId ? (
          <section className="hidden flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 xl:flex">
            <p className="text-sm font-semibold text-zinc-100">프레임 미리보기</p>
            <div className="flex justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                className="w-full max-w-[240px]"
              />
            </div>
          </section>
        ) : null}

        {renderExtraControls ? (
          <section className="flex flex-col gap-2">{renderExtraControls()}</section>
        ) : null}
      </aside>
    </div>
  );
}
