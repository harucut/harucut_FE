"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { CheckCircle2, RotateCcw, X } from "lucide-react";
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
  guideText: string;
  emptyStateText?: string;
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
  guideText,
  emptyStateText = "선택 가능한 사진이나 영상이 아직 없어요.",
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
  const progressLabel = `${selectedCount} / ${maxSelect}`;
  const nextSlotIndex = selectedIndexes.findIndex((index) => index == null);
  const selectionHint =
    nextSlotIndex === -1
      ? "선택이 모두 끝났어요. 다음 단계에서 결과를 확인해 보세요."
      : `${nextSlotIndex + 1}번 칸에 넣을 미디어를 골라 주세요. 아래 목록에서 눌러 바로 채울 수 있어요.`;

  return (
    <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section className="flex flex-col gap-3">
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">선택 현황</p>
              <p className="mt-1 text-[11px] text-zinc-500">{guideText}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-zinc-300">
              {progressLabel}
            </span>
          </div>
          <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-100">
            {selectionHint}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">선택 슬롯</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                선택한 순서대로 프레임의 1번, 2번, 3번, 4번 칸에 들어가요.
              </p>
            </div>
            {canProceed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-100">
                <CheckCircle2 className="h-3.5 w-3.5" />
                선택 완료
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {selectedIndexes.map((selectedIndex, slotIndex) => {
              const item = selectedIndex == null ? null : baseItems[selectedIndex] ?? null;
              const isActive = nextSlotIndex === slotIndex || (nextSlotIndex === -1 && item != null);

              return (
                <div
                  key={slotIndex}
                  className={[
                    "relative overflow-hidden rounded-2xl border bg-black/30",
                    item ? "border-white/10" : "border-dashed border-white/10",
                    isActive ? "ring-2 ring-emerald-400/40" : "",
                  ].join(" ")}
                >
                  <div className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-2 py-1 text-[10px] text-zinc-100">
                    {slotIndex + 1}번
                  </div>

                  {item ? (
                    <>
                      {item.type === "video" ? (
                        <video
                          src={item.src}
                          className="aspect-[3/4] w-full object-cover"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.src}
                          alt={`selected-slot-${slotIndex + 1}`}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      )}

                      {selectedIndex != null ? (
                        <button
                          type="button"
                          onClick={() => onToggleSelect(selectedIndex)}
                          className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-zinc-100 hover:bg-black/80"
                        >
                          <X className="h-3.5 w-3.5" />
                          해제
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <div className="grid aspect-[3/4] place-items-center px-3 text-center text-[11px] text-zinc-500">
                      {isActive ? "다음 선택 칸" : "선택 대기"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

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
                    className={[
                      "group relative aspect-[3/4] overflow-hidden rounded-xl border bg-black text-left transition",
                      isSelected
                        ? "border-emerald-400 ring-2 ring-emerald-400/60"
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

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-2 py-2 text-[10px] text-zinc-100">
                      {isSelected ? `${order}번 칸에 배치` : "선택 가능"}
                    </div>

                    <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-zinc-200">
                      #{index + 1}
                    </span>

                    {isSelected ? (
                      <span className="pointer-events-none absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-zinc-950">
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
            className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {nextButtonLabel}
          </button>
        </section>
      </section>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-6">
        {frameId ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-medium text-zinc-200">프레임 미리보기</p>
            <div className="flex justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                className="w-full max-w-[250px]"
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
