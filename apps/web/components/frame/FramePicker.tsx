"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";

type FramePickerLayoutMode = "carousel" | "grid";

/** 프린트 종이 색. 예시 사진을 넣은 실물처럼 보여 준다 — 빈 칸만 보면 무엇이 나오는지 그려지지 않는다. */
const PRINT_PAPER = "#FFFFFF";

/** 손을 뗀 뒤 이만큼 움직임이 없으면 가운데 온 카드를 고른 것으로 친다. */
const SWIPE_SETTLE_MS = 120;

type FramePickerProps = {
  selectedFrameId: FrameId | null;
  onChangeSelected: (id: FrameId) => void;
};

/**
 * 컷 구성 고르기.
 *
 * 폰은 가운데 큰 카드 + 양옆이 살짝 보이는 캐러셀이다. 옆으로 밀면 가운데 온 카드가 곧 선택이다 — 예전에는 민 뒤에
 * 다시 눌러야 골라졌고, 가운데 보이는 것과 실제 선택이 달랐다. 눌러도 되고 방향키도 된다. 넓은 화면은 네 장을 한눈에 놓는다.
 */
export function FramePicker({ selectedFrameId, onChangeSelected }: FramePickerProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<FrameId, HTMLButtonElement>());
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstCenter = useRef(true);

  // 선택이 바뀌면 그 카드를 가운데로 데려온다(저장한 프레임을 골라 컷 구성이 바뀐 경우 포함).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const card = selectedFrameId ? cardRefs.current.get(selectedFrameId) : null;
    if (!scroller || !card || !scroller.clientWidth) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo?.({
      left: card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2,
      behavior: firstCenter.current || reduced ? "auto" : "smooth",
    });
    firstCenter.current = false;
  }, [selectedFrameId]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const handleScroll = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const center = scroller.scrollLeft + scroller.clientWidth / 2;
      let nearest: FrameId | null = null;
      let nearestDistance = Infinity;
      cardRefs.current.forEach((card, id) => {
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (distance < nearestDistance) {
          nearest = id;
          nearestDistance = distance;
        }
      });
      if (nearest && nearest !== selectedFrameId) onChangeSelected(nearest);
    }, SWIPE_SETTLE_MS);
  }, [onChangeSelected, selectedFrameId]);

  const handleArrowKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const index = FRAME_CONFIGS.findIndex((frame) => frame.id === selectedFrameId);
    const next = FRAME_CONFIGS[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    onChangeSelected(next.id);
    cardRefs.current.get(next.id)?.focus({ preventScroll: true });
  };

  return (
    <section aria-label="컷 구성" className="flex flex-col gap-3">
      <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
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

      <div className="md:hidden">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onKeyDown={handleArrowKeys}
          className="relative -mx-2 flex snap-x snap-mandatory overflow-x-auto py-2 scrollbar-none [-ms-overflow-style:none] sm:-mx-4 [&::-webkit-scrollbar]:hidden"
          // 첫 카드와 끝 카드도 가운데 올 수 있게 양옆을 비운다.
          style={{ paddingInline: "calc((100% - min(68vw, 280px)) / 2)" }}
        >
          {FRAME_CONFIGS.map((frame) => (
            <FramePickerCard
              key={frame.id}
              ref={(node) => {
                if (node) cardRefs.current.set(frame.id, node);
                else cardRefs.current.delete(frame.id);
              }}
              frameId={frame.id}
              frameName={frame.name}
              selected={frame.id === selectedFrameId}
              onClick={() => onChangeSelected(frame.id)}
              mode="carousel"
            />
          ))}
        </div>
        {/* 지금 몇 번째인지. 선택은 카드의 aria-pressed 가 이미 말한다. */}
        <div aria-hidden className="mt-1 flex justify-center gap-1.5">
          {FRAME_CONFIGS.map((frame) => (
            <span
              key={frame.id}
              className={`size-1.5 rounded-full transition-colors ${frame.id === selectedFrameId ? "bg-(--hc-text)" : "bg-(--hc-border-strong)"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 고른 프레임으로 넘어가는 주 버튼. 폰에서는 화면 아래에 붙는다 — 저장한 프레임 목록이 길어도 엄지가 닿는 곳에 있다.
 * 흐름의 맨 끝에 놓아야 아래에 붙는다(FrameChooser).
 */
export function FramePickerConfirm({
  onConfirm,
  confirmDisabled = false,
  confirmLabel = "선택한 프레임으로 진행하기",
}: {
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLabel?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-2 mt-auto bg-linear-to-t from-(--background) from-70% to-transparent px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-6 sm:-mx-4 sm:px-4 md:static md:mx-0 md:flex md:justify-end md:bg-none md:p-0">
      <button
        type="button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className="hc-button-primary inline-flex h-14 w-full items-center justify-center rounded-full px-5 text-[16px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50 md:h-12 md:w-auto md:min-w-50 md:px-6 md:text-[15px]"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function FramePickerCard({
  ref,
  frameId,
  frameName,
  selected,
  onClick,
  mode = "grid",
}: {
  ref?: React.Ref<HTMLButtonElement>;
  frameId: FrameId;
  frameName: string;
  selected: boolean;
  onClick: () => void;
  mode?: FramePickerLayoutMode;
}) {
  const carousel = mode === "carousel";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "group relative flex touch-manipulation flex-col items-center gap-3 text-center",
        carousel
          ? `w-[min(68vw,280px)] shrink-0 snap-center transition-[opacity,transform] duration-200 ${selected ? "" : "scale-90 opacity-55"}`
          : `w-full rounded-[20px] border p-4 transition-colors ${
              selected
                ? "border-(--hc-primary-line) bg-(--hc-surface-highlight) shadow-[0_0_0_1px_var(--hc-primary-line)]"
                : "border-(--hc-border) bg-(--hc-surface) hover:border-(--hc-border-strong)"
            }`,
      ].join(" ")}
    >
      {/* 칸 높이를 고정한다 — 세로 긴 띠와 가로 사진이 섞여도 이름과 버튼이 같은 줄에 온다. */}
      <div className={`flex size-full items-center justify-center drop-shadow-xl ${carousel ? "h-[min(50svh,440px)]" : "h-64"}`}>
        {/* 폭이 정해진 상자여야 가로 프레임(폭 기준)도 제 크기로 그려진다. 종이에 선을 두르지 않는다. */}
        <FramePreview
          frameId={frameId}
          images={DEMO_PHOTOS}
          borderColor={PRINT_PAPER}
          imageLoading="eager"
          className="max-h-full max-w-full border-0!"
        />
      </div>

      {/* 이름과 선택 표시만 남긴다. 설명·추천 태그는 위 미리보기가 이미 보여주는 것을
          말로 옮긴 것이라 걷어냈다(constants/frames.ts 주석). */}
      <span className={`flex items-center gap-2 text-[15px] ${selected ? "font-extrabold text-(--hc-text)" : "font-semibold text-(--hc-muted)"}`}>
        {frameName}
        {selected && !carousel ? (
          <span aria-hidden className="grid size-5 place-items-center rounded-full bg-(--hc-primary) text-(--hc-primary-contrast)">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </span>
    </button>
  );
}
