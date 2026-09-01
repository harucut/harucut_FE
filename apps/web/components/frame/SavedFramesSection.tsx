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

  /**
   * 조회에 실패했는데 보여줄 것도 없는 상태. **"없음"이 아니라 "모름"이다.**
   *
   * 예전에는 실패 문구와 빈 목록 문구가 **함께** 떴다("불러오지 못했어요" 바로 밑에
   * "저장한 프레임이 없어요"). 실패하면 frames 가 빈 배열이라 빈 목록 분기까지 같이 걸렸다.
   *
   * 단순히 지저분한 게 아니라 **하지 말아야 할 말을 한다.** 요청이 실패했을 뿐인데
   * 사용자에게는 "네가 저장한 프레임이 하나도 없다"고 단정하는 것이라, 공들여 꾸민
   * 프레임이 날아간 줄 알게 된다.
   *
   * 반대로 목록을 이미 받아 둔 채 새로고침만 실패한 경우는 목록을 지우지 않는다 —
   * 방금까지 보이던 것이 사라지는 편이 더 나쁘다. 그때는 배너로만 알린다.
   */
  const failedWithNothing = Boolean(error) && frames.length === 0;

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

      {/* 목록은 남아 있는데 새로고침만 실패한 경우. 목록을 지우지 않고 위에만 알린다. */}
      {error && !failedWithNothing ? (
        <p role="alert" className="mt-3 text-[11px] text-[color:var(--hc-danger)]">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-[12px] text-[color:var(--hc-muted)]">불러오는 중...</p>
      ) : failedWithNothing ? (
        <div role="alert" className="mt-3 flex flex-col items-start gap-2">
          <p className="text-[12px] text-[color:var(--hc-danger)]">{error}</p>
          {/* 실패를 사라짐으로 읽지 않게 못 박는다. 이 문장이 없으면 사용자는 공들여
              꾸민 프레임이 날아간 줄 안다. */}
          <p className="text-[11px] leading-[1.6] text-[color:var(--hc-muted)]">
            저장한 프레임이 사라진 것은 아니에요. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="hc-button-secondary rounded-full border px-3 py-1 text-[11px] font-medium"
          >
            다시 시도
          </button>
        </div>
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
