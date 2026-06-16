"use client";

import { Lock, RotateCcw } from "lucide-react";
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
  /** 요금제 보관 한도. 이 개수를 넘는 저장 프레임은 잠금(읽기전용)으로 표시 */
  planLimit?: number;
  /** 잠금 프레임의 업그레이드 CTA */
  onUpgrade?: () => void;
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
  planLimit,
  onUpgrade,
}: SavedFramesSectionProps) {
  const matchingFrames = useMemo(
    () =>
      selectedFrameId
        ? frames.filter((frame) => matchesFrameType(selectedFrameId, frame.frameType))
        : frames,
    [frames, selectedFrameId],
  );

  // 전체 저장 프레임 기준으로 한도를 넘는 프레임의 frameId를 잠금 대상으로 표시한다.
  // (필터된 목록의 인덱스가 아니라 전체 저장 순서를 기준으로 계산)
  const lockedFrameIds = useMemo(() => {
    if (planLimit === undefined) return new Set<number>();
    return new Set(frames.slice(planLimit).map((frame) => frame.frameId));
  }, [frames, planLimit]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-[11px] text-zinc-500">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="새로고침"
          title="새로고침"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error ? <p className="mt-3 text-[11px] text-red-300">{error}</p> : null}

      {isLoading ? (
        <p className="mt-3 text-[11px] text-zinc-500">불러오는 중...</p>
      ) : matchingFrames.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">{emptyText}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-3">
          {matchingFrames.map((frame) => {
            const isSelected = selectedRemoteFrameId === frame.frameId;
            const previewFrameId = frameIdFromFrameType(frame.frameType);
            const isLocked = lockedFrameIds.has(frame.frameId);

            return (
              <article
                key={frame.frameId}
                className={[
                  "rounded-2xl border bg-zinc-950/70 p-3 transition",
                  isLocked
                    ? "border-zinc-800 opacity-60"
                    : isSelected
                      ? "border-[color:var(--hc-primary)]"
                      : "border-zinc-800 hover:border-zinc-600",
                ].join(" ")}
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => !isLocked && onSelectRemoteFrame(frame)}
                    disabled={isLocked}
                    className="flex min-w-0 flex-1 gap-3 text-left disabled:cursor-not-allowed"
                  >
                    <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
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
                      {isLocked ? (
                        <span className="absolute inset-0 grid place-items-center bg-black/55">
                          <Lock className="h-5 w-5 text-white" />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                      <div>
                        <p className="truncate text-sm font-semibold text-zinc-100">
                          {frame.title || `프레임 #${frame.frameId}`}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                          {frame.description || "저장한 프레임을 다음 단계에서 바로 적용할 수 있어요."}
                        </p>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {isLocked
                          ? "요금제 한도 초과 · 잠금"
                          : isSelected
                            ? selectedStatusText
                            : idleStatusText}
                      </span>
                    </div>
                  </button>

                  {isLocked ? (
                    onUpgrade ? (
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={onUpgrade}
                          className="hc-accent-chip rounded-full border px-3 py-1 text-[10px] font-medium"
                        >
                          업그레이드
                        </button>
                      </div>
                    ) : null
                  ) : onAction ? (
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => onAction(frame)}
                        className="hc-accent-chip rounded-full border px-3 py-1 text-[10px] font-medium"
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
