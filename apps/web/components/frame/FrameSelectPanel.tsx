"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, RotateCcw, WandSparkles } from "lucide-react";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { SLOT_COLORS } from "@/constants/colors";
import type { FrameId } from "@/constants/frames";
import type { FourcutFilterId } from "@/lib/frameFilters";
import type { ThemeExportJson } from "@/lib/types/themeEditor";
import { Sentences } from "@/components/ui/Sentences";
import { SegmentButton } from "@/components/ui/SegmentButton";

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
  /** 「꾸미기」 쪽 내용. 주면 미리보기 아래에 [사진 | 꾸미기] 전환이 생긴다. */
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
  const slot = frameId ? FRAME_LAYOUTS[frameId].slots[0] : null;
  const aspectRatio = slot ? slot.width / slot.height : 3 / 4;
  const isFull = selectedCount >= maxSelect;

  /*
    미리보기 바로 아래 [사진 | 꾸미기] 전환(2026-11-14, 시안 B). 예전에는 테두리 색·보정이 사진 여덟 장
    밑에 있어 폰에서는 스크롤해야 보였고, 고르는 동안 미리보기는 화면 밖이었다. 이제 미리보기를 보며
    어느 쪽이든 한 화면에서 고른다. 단추 모양은 기록(그리드·달력)·편집기(스티커·텍스트)와 같다.
  */
  const [tab, setTab] = useState<"photos" | "decorate">("photos");
  const decorating = renderExtraControls != null && tab === "decorate";

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
          <section className="flex flex-col gap-2 rounded-2xl border border-(--hc-border) bg-(--hc-surface) p-3 lg:hidden">
            {/* 폭만 220px 로 묶으면 세로 4컷(1:3)은 660px 가 돼 첫 화면을 통째로 먹고, 고를 사진도
                다음 버튼도 스크롤 뒤에 숨는다. 높이를 잡고 폭은 비율이 정하게 한다. 아래 전환 단추 몫만큼
                줄였다 — 390×844 에서 사진 두 줄 반, 꾸미기는 스크롤 없이 다 보인다. */}
            <div className="flex h-[min(32dvh,260px)] justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                markSlots
                className="max-h-full w-auto max-w-full"
              />
            </div>
          </section>
        ) : null}

        {renderExtraControls ? (
          <div className="flex justify-center lg:justify-start">
            <div className="hc-surface-well inline-flex items-center gap-1 rounded-full p-1">
              <SegmentButton active={!decorating} onClick={() => setTab("photos")} Icon={LayoutGrid}>
                사진
              </SegmentButton>
              <SegmentButton active={decorating} onClick={() => setTab("decorate")} Icon={WandSparkles}>
                꾸미기
              </SegmentButton>
            </div>
          </div>
        ) : null}

        {decorating ? (
          <section className="pt-1 pb-2">{renderExtraControls?.()}</section>
        ) : (
          <>
            <section className="space-y-2">
              {baseItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-(--hc-border) bg-(--hc-surface) p-4 text-center text-[12px] text-(--hc-muted)">
                  <Sentences text={emptyStateText} />
                </div>
              ) : (
                <div className={`grid gap-2 ${aspectRatio > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"} lg:grid-cols-5`}>
                  {baseItems.map((item, index) => {
                    const slotIndex = selectedIndexes.indexOf(index);
                    const isSelected = slotIndex !== -1;
                    const order = slotIndex + 1;
                    // 들어간 칸의 색. 미리보기의 그 칸과 같은 색이라 어느 칸에 들어갔는지 이어진다.
                    const slotColor = isSelected ? SLOT_COLORS[slotIndex % SLOT_COLORS.length] : null;

                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleToggle(index, isSelected)}
                        style={slotColor ? { aspectRatio, borderColor: slotColor, boxShadow: `0 0 0 2px ${slotColor}` } : { aspectRatio }}
                        aria-pressed={isSelected}
                        aria-label={
                          isSelected
                            ? `${index + 1}번 사진 선택 해제 (현재 ${order}번째로 선택됨)`
                            : isFull
                              ? `${index + 1}번 사진 — ${maxSelect}장을 다 골라 더 선택할 수 없어요`
                              : `${index + 1}번 사진 선택`
                        }
                        className={[
                          "group relative overflow-hidden rounded-xl border bg-black text-left transition",
                          isSelected
                            ? ""
                            : isFull
                              ? "border-(--hc-border) opacity-45"
                              : "border-(--hc-border) hover:border-(--hc-border-strong)",
                        ].join(" ")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.src}
                          alt={`${index + 1}번 사진`}
                          className="h-full w-full object-cover"
                        />

                        {/* 배지는 들어간 칸 번호 하나만, 그 칸의 색으로. 원본 순번(#n)은 고를 때 쓰는 정보가 아니고,
                            aria-label 이 이미 두 정보를 다 말한다. 미선택 타일은 사진만 남는다. */}
                        {slotColor ? (
                          <span
                            className="pointer-events-none absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[12px] font-bold tabular-nums text-[#14140F] shadow-sm"
                            style={{ backgroundColor: slotColor }}
                          >
                            {order}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* 흐름의 주 CTA 는 업로드 화면(h-12 · 15px · 800)과 같은 크기다. 화면마다 달랐다.
            바탕은 화면 바탕과 같은 색이다 — 흰 띠가 꾸미기처럼 짧은 화면에서 홀로 떠 보였다. */}
        <section className="sticky bottom-0 z-10 flex items-center gap-2 bg-(--hc-page-gradient-app) py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:relative">
          {/*
            다 고른 뒤 다섯 번째를 누르면 왜 안 되는지 단추 줄 바로 위에 잠깐 띄운다. 예전에는 사진 목록 아래
            줄이라 폰에서는 화면 밖이었다 — 눌러도 아무 일 없는 것처럼 보였다(2026-11-14 실측).
            role="status" 라 화면 낭독기도 듣는다. 늘 그려 두고 투명도만 바꿔, 뜰 때 자리가 밀리지 않는다.
          */}
          <p
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute inset-x-0 bottom-full flex justify-center pb-2 transition-opacity ${
              limitNotice ? "opacity-100" : "opacity-0"
            }`}
          >
            {limitNotice ? (
              <span className="rounded-2xl bg-(--hc-text) px-4 py-2.5 text-center text-[12px] font-semibold text-(--hc-surface) shadow-(--hc-card-shadow)">
                <Sentences text={`${maxSelect}장까지만 담을 수 있어요. 바꾸려면 담은 사진을 먼저 눌러 빼 주세요.`} />
              </span>
            ) : null}
          </p>
          {/* 초기화는 아이콘 하나다(시안 B). 고른 사진이 없으면 할 일이 없어 잠근다. */}
          <button
            type="button"
            onClick={onReset}
            disabled={selectedCount === 0}
            aria-label="선택 초기화"
            title="선택 초기화"
            className="grid size-12 shrink-0 place-items-center rounded-full border border-(--hc-border) text-(--hc-muted) transition hover:border-(--hc-border-strong) hover:text-(--hc-text) disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw aria-hidden className="h-4.5 w-4.5" />
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
          <section className="hidden flex-col gap-2 rounded-2xl border border-(--hc-border) bg-(--hc-surface) p-3 lg:flex">
            <div className="flex justify-center">
              <FramePreview
                frameId={frameId}
                media={slotMedia}
                theme={themeData}
                borderColor={borderColor}
                outputFilter={outputFilter}
                markSlots
                className="w-full max-w-60"
              />
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
