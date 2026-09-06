"use client";

import { Check, Circle } from "lucide-react";
import { FRAME_CONFIGS, getFrameConfig, type FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";

type FramePickerLayoutMode = "carousel" | "grid";

const FRAME_PICKER_PREVIEW_VIEWPORT =
  "flex h-[176px] w-[132px] items-center justify-center";
const PREVIEW_BORDER_COLOR = "var(--hc-frame-picker-preview-outer)";
const PREVIEW_SLOT_COLOR = "var(--hc-frame-picker-preview-inner)";

type FramePickerProps = {
  selectedFrameId: FrameId | null;
  onChangeSelected: (id: FrameId) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLabel?: string;
};

export function FramePicker({
  selectedFrameId,
  onChangeSelected,
  onConfirm,
  confirmDisabled = false,
  confirmLabel = "선택한 프레임으로 진행하기",
}: FramePickerProps) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4 max-md:hidden lg:grid-cols-3 xl:grid-cols-4">
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
      </section>

      <div className="mt-2 flex justify-stretch md:justify-end">
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={onConfirm}
          className="hc-button-primary inline-flex h-12 w-full items-center justify-center rounded-full px-5 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:min-w-[200px] md:px-6"
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
  // 이름·순서·짧은 태그 모두 FRAME_CONFIGS 가 단일 소스다.
  const config = getFrameConfig(frameId);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "group relative overflow-hidden rounded-[28px] border p-3 text-left transition-[border-color,background-color,box-shadow] duration-200",
        mode === "grid"
          ? "w-full"
          : "w-[min(78vw,320px)] shrink-0 snap-center sm:w-[320px]",
        selected
          ? "border-[color:var(--hc-primary)] bg-zinc-900 shadow-[0_0_0_1px_var(--hc-accent-soft-border)]"
          : "border-zinc-800 bg-zinc-900/70 hover:border-zinc-600 hover:bg-zinc-900",
      ].join(" ")}
    >
      {/* 표면 광택 — 색은 "선택됨"에만 쓴다.
          네 카드에 같은 초록 그라데이션을 깔면 정보량이 0인데다,
          비선택 카드까지 액센트로 물들어 선택 신호를 잡아먹는다.
          비선택은 무채색 광택으로 입체감만 주고, 초록은 선택된 카드에서만 켠다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity"
        style={{
          background: selected
            ? "linear-gradient(to bottom, color-mix(in srgb, var(--hc-primary) 22%, transparent), transparent 65%)"
            : "linear-gradient(to bottom, rgba(255,255,255,0.07), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col gap-3">
        <div
          className={[
            "relative flex items-center justify-center rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-muted)]",
            mode === "grid" ? "min-h-[220px] p-3" : "min-h-[220px] p-4",
          ].join(" ")}
        >
          {/* 추천 표시. 한 장에만 붙어야 "이걸 고르면 무난하다"로 읽힌다 —
              넷 다 칩을 달면 그냥 분류 라벨이 된다(constants/frames.ts 주석). */}
          {config.recommended ? (
            <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/70 px-2 py-0.5 text-[11px] font-bold tracking-[0.08em] text-white">
              BEST
            </span>
          ) : null}

          <div className={FRAME_PICKER_PREVIEW_VIEWPORT}>
            <FramePreview
              frameId={frameId}
              className="max-h-full max-w-full"
              borderColor={PREVIEW_BORDER_COLOR}
              slotColor={PREVIEW_SLOT_COLOR}
            />
          </div>
        </div>

        {/* 이름과 선택 표시만 남긴다. 설명·추천 태그는 위 미리보기가 이미 보여주는 것을
            말로 옮긴 것이라 걷어냈다(constants/frames.ts 주석). */}
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-zinc-50">
            {frameName}
          </p>
          <span
              className={[
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                selected
                  ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-primary)] text-[color:var(--hc-primary-contrast)]"
                  : "border-[color:var(--hc-border)] bg-[color:var(--hc-surface-muted)] text-zinc-400",
              ].join(" ")}
          >
            {selected ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
          </span>
        </div>
      </div>
    </button>
  );
}
