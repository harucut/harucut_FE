"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  emptyStateText = "선택 가능한 사진이 아직 없어요.",
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
      return images.map((src) => ({ src }));
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
  const isFull = selectedCount >= maxSelect;

  // 4장을 다 고른 뒤 다섯 번째를 누르면 아무 일도 일어나지 않았다 — 스토어가 조용히 무시한다.
  // 눌린 게 안 먹힌 건지 사진이 잘못된 건지 알 길이 없어서, 왜 안 되는지 말해 준다.
  const [limitNotice, setLimitNotice] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const handleToggle = useCallback(
    (index: number, alreadySelected: boolean) => {
      if (isFull && !alreadySelected) {
        setLimitNotice(true);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setLimitNotice(false), 2600);
        return;
      }
      setLimitNotice(false);
      onToggleSelect(index);
    },
    [isFull, onToggleSelect],
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <section className="flex flex-col gap-3">
        {frameId ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-3 lg:hidden">
            {/* 폭만 220px 로 묶으면 세로 4컷(1:3)은 660px 가 돼 첫 화면을 통째로 먹고, 고를 사진도
                다음 버튼도 스크롤 뒤에 숨는다. 높이를 잡고 폭은 비율이 정하게 한다. */}
            <div className="flex h-[min(36dvh,300px)] justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                className="max-h-full w-auto max-w-full"
              />
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          {baseItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 text-center text-[12px] text-[color:var(--hc-muted)]">
              {emptyStateText}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {baseItems.map((item, index) => {
                const slotIndex = selectedIndexes.indexOf(index);
                const isSelected = slotIndex !== -1;
                const order = slotIndex + 1;

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleToggle(index, isSelected)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `${index + 1}번 사진 선택 해제 (현재 ${order}번째로 선택됨)`
                        : isFull
                          ? `${index + 1}번 사진 — ${maxSelect}장을 다 골라 더 선택할 수 없어요`
                          : `${index + 1}번 사진 선택`
                    }
                    className={[
                      "group relative aspect-[3/4] overflow-hidden rounded-xl border bg-black text-left transition",
                      isSelected
                        ? "border-[color:var(--hc-primary)] ring-2 ring-[color:var(--hc-accent-soft-border)]"
                        : isFull
                          ? "border-[color:var(--hc-border)] opacity-45"
                          : "border-[color:var(--hc-border)] hover:border-[color:var(--hc-border-strong)]",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt={`${index + 1}번 사진`}
                      className="h-full w-full object-cover"
                    />

                    {/* 배지는 선택 순서 하나만. 원본 순번(#n)은 고를 때 쓰는 정보가 아니고,
                        aria-label 이 이미 두 정보를 다 말한다. 미선택 타일은 사진만 남는다. */}
                    {isSelected ? (
                      <span className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--hc-primary)] font-mono text-[12px] font-bold tabular-nums text-[color:var(--hc-primary-contrast)] shadow-sm">
                        {order}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/*
          role="status" 로 둬서 스크린리더도 듣는다. 자리를 항상 차지하게 두면 문구가 떴다
          사라질 때 아래 버튼이 밀리지 않는다.
        */}
        <p
          role="status"
          aria-live="polite"
          className={[
            "min-h-[18px] text-[12px] transition-opacity",
            limitNotice
              ? "text-[color:var(--hc-danger)] opacity-100"
              : "text-[color:var(--hc-muted)] opacity-0",
          ].join(" ")}
        >
          {limitNotice
            ? `${maxSelect}장까지만 담을 수 있어요. 바꾸려면 담은 사진을 먼저 눌러 빼 주세요.`
            : ""}
        </p>

        {/* 흐름의 주 CTA 는 업로드 화면(h-12 · 15px · 800)과 같은 크기다. 화면마다 달랐다. */}
        <section className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--hc-border)] px-4 text-[13px] text-[color:var(--hc-muted)] transition hover:border-[color:var(--hc-border-strong)] hover:text-[color:var(--hc-text)]"
          >
            <RotateCcw className="h-4 w-4" />
            선택 초기화
          </button>

          <button
            type="button"
            disabled={!canProceed}
            onClick={onNext}
            className="hc-button-primary inline-flex h-12 flex-1 items-center justify-center rounded-full px-5 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {canProceed ? nextButtonLabel : incompleteButtonLabel ?? nextButtonLabel}
          </button>
        </section>
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
        {frameId ? (
          <section className="hidden flex-col gap-2 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-3 lg:flex">
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
