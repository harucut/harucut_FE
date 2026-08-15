"use client";

import { RotateCcw } from "lucide-react";
import { useMemo } from "react";
import type { FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import type { RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType, matchesFrameType } from "@/lib/frameApi";

type SavedFramesSectionProps = {
  title: string;
  description?: string;
  emptyText: string;
  selectedFrameId: FrameId | null;
  frames: RemoteFrame[];
  isLoading: boolean;
  error: string | null;
  selectedRemoteFrameId: number | null;
  onSelectRemoteFrame: (frame: RemoteFrame) => void;
  onRefresh: () => void;
  onAction?: (frame: RemoteFrame) => void;
  actionLabel?: string;
  selectedStatusText?: string;
  idleStatusText?: string;
};

export function SavedFramesSection({
  title,
  description,
  emptyText,
  selectedFrameId,
  frames,
  isLoading,
  error,
  selectedRemoteFrameId,
  onSelectRemoteFrame,
  onRefresh,
  onAction,
  actionLabel = "열기",
  selectedStatusText = "선택됨",
  idleStatusText = "클릭해서 선택",
}: SavedFramesSectionProps) {
  const matchingFrames = useMemo(
    () =>
      selectedFrameId
        ? frames.filter((frame) => matchesFrameType(selectedFrameId, frame.frameType))
        : frames,
    [frames, selectedFrameId],
  );

  // 상단 게이지는 "보관 1개"라고 하는데 이 목록은 "저장한 프레임이 없어요"라고 말하는
  // 상태가 있었다. 목록이 선택한 프레임 타입으로 걸러지는데 그 사실이 화면에 없어서다.
  // 걸러져서 빈 것과 정말 하나도 없는 것을 구분해 말한다.
  const hiddenByFilter = frames.length > 0 && matchingFrames.length === 0;

  // 잠금 표시는 두지 않는다. 서버가 활성 프레임만 내려주므로 목록에 온 프레임은 전부
  // 사용할 수 있다. 다운그레이드로 비활성된 프레임은 애초에 응답에 포함되지 않는다.
  // 남은 보관 여유는 상단 FrameCapacityMeter가 서버 사용량 기준으로 보여준다.

  return (
    <section className="rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-[11px] text-[color:var(--hc-muted)]">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="새로고침"
          title="새로고침"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--hc-border)] text-[color:var(--hc-muted)] transition hover:border-[color:var(--hc-border-strong)] hover:text-[color:var(--hc-text)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? <p role="alert" className="mt-3 text-[11px] text-[color:var(--hc-danger)]">{error}</p> : null}

      {isLoading ? (
        <p className="mt-3 text-[12px] text-[color:var(--hc-muted)]">불러오는 중...</p>
      ) : hiddenByFilter ? (
        <p className="mt-2 text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
          보관 중인 프레임 {frames.length}개는 지금 고른 것과 컷 구성이 달라요. 위에서 같은
          구성을 고르면 바로 나타나요.
        </p>
      ) : matchingFrames.length === 0 ? (
        <p className="mt-2 text-[12px] text-[color:var(--hc-muted)]">{emptyText}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-3">
          {matchingFrames.map((frame) => {
            const isSelected = selectedRemoteFrameId === frame.frameId;
            const previewFrameId = frameIdFromFrameType(frame.frameType);

            return (
              <article
                key={frame.frameId}
                className={[
                  "rounded-2xl border bg-[color:var(--hc-card)] p-3 transition",
                  isSelected
                    ? "border-[color:var(--hc-primary)]"
                    : "border-[color:var(--hc-border)] hover:border-[color:var(--hc-border-strong)]",
                ].join(" ")}
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectRemoteFrame(frame)}
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)]">
                      {frame.source ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={frame.source}
                          alt={frame.title || `프레임 #${frame.frameId}`}
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <FramePreview frameId={previewFrameId} />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div>
                        <p className="truncate text-sm font-semibold text-[color:var(--hc-text)]">
                          {frame.title || `프레임 #${frame.frameId}`}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-[color:var(--hc-muted)]">
                          {frame.description || "저장한 프레임을 다음 단계에서 바로 적용할 수 있어요."}
                        </p>
                      </div>
                      <span className="text-[11px] text-[color:var(--hc-muted)]">
                        {isSelected ? selectedStatusText : idleStatusText}
                      </span>
                    </div>
                  </button>

                  {onAction ? (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => onAction(frame)}
                        className="hc-accent-chip rounded-full border px-3 py-1 text-[11px] font-medium"
                      >
                        {actionLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
