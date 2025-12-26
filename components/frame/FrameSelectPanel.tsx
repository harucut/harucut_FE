"use client";

import { ReactNode, useMemo } from "react";
import { type FrameId } from "@/constants/frames";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";

type FrameSelectPanelProps = {
  frameId: FrameId | null;
  images?: string[]; // 촬영이든 업로드든 그냥 "이미지 리스트"
  media?: FrameMedia[];
  selectedIndexes: (number | null)[]; // 선택된 인덱스들
  maxSelect: number; // 최대 선택 개수

  guideText: string; // "사진 n장 중에서 ~장 골라주세요" 같은 문구
  emptyStateText?: string;

  nextButtonLabel: string; // "다음 단계로" 버튼 문구
  onToggleSelect: (index: number) => void;
  onReset: () => void;
  onNext: () => void;

  renderExtraControls?: () => ReactNode;
};

export function FrameSelectPanel({
  frameId,
  images,
  media,
  selectedIndexes,
  maxSelect,
  guideText,
  emptyStateText = "사진이 없어요.",
  nextButtonLabel,
  onToggleSelect,
  onReset,
  onNext,
  renderExtraControls,
}: FrameSelectPanelProps) {
  const baseItems: FrameMedia[] = useMemo(() => {
    if (media && media.length) return media;
    if (images && images.length) {
      return images.map((src) => ({ type: "image" as const, src }));
    }
    return [];
  }, [media, images]);

  const slotMedia = useMemo(
    () =>
      selectedIndexes.map((idx) =>
        idx == null ? null : baseItems[idx] ?? null
      ),
    [selectedIndexes, baseItems]
  );

  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );
  const canProceed = selectedCount === maxSelect;

  return (
    <>
      {/* 프레임 미리보기 */}
      {frameId && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium text-zinc-300">
            선택한 프레임 미리보기
          </h2>
          <div className="flex h-[330px] justify-center">
            <FramePreview frameId={frameId} media={slotMedia} />
          </div>
          <p className="text-center text-[10px] text-zinc-500">
            아래에서 사진을 고르면, 위 프레임에 선택 순서대로 채워져요.
          </p>
        </section>
      )}

      {/* 안내 문구 */}
      <p className="text-[11px] text-zinc-400">{guideText}</p>

      {renderExtraControls && (
        <section className="flex flex-col gap-2">
          {renderExtraControls()}
        </section>
      )}

      {/* 사진 리스트 */}
      <section className="space-y-2">
        {baseItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-4 text-center text-[11px] text-zinc-500">
            {emptyStateText}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
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
                    "relative aspect-[3/4] overflow-hidden rounded-lg border bg-black",
                    isSelected
                      ? "border-emerald-400 ring-2 ring-emerald-400/60"
                      : "border-zinc-700",
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
                  <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-zinc-200">
                    #{index + 1}
                  </span>
                  {isSelected && (
                    <span className="pointer-events-none absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-zinc-950">
                      {order}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 하단 영역 */}
      <section className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
        <div className="flex flex-col">
          <span>
            선택된 사진 {selectedCount} / {maxSelect}장
          </span>
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-fit rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:bg-zinc-900"
          >
            프레임 선택부터 다시 하기
          </button>
        </div>
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextButtonLabel}
        </button>
      </section>
    </>
  );
}
