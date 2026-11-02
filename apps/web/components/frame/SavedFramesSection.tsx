"use client";

import { Check, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import type { FrameId } from "@/constants/frames";
import { FramePreview } from "@/components/frame/FramePreview";
import { FrameWithPhotos, frameFitStyle } from "@/components/participation/FrameWithPhotos";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";
import type { RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType, matchesFrameType } from "@/lib/frameApi";

type SavedFramesSectionProps = {
  title: string;
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
};

export function SavedFramesSection({
  title,
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
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">{title}</h2>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="새로고침"
          title="새로고침"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-(--hc-muted) transition hover:text-(--hc-text)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 목록은 남아 있는데 새로고침만 실패한 경우. 목록을 지우지 않고 위에만 알린다. */}
      {error && !failedWithNothing ? (
        <p role="alert" className="mt-3 text-[11px] text-(--hc-danger)">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-[12px] text-(--hc-muted)">불러오는 중…</p>
      ) : failedWithNothing ? (
        <div role="alert" className="mt-3 flex flex-col items-start gap-2">
          <p className="text-[12px] text-(--hc-danger)">{error}</p>
          {/* 실패를 사라짐으로 읽지 않게 못 박는다. 이 문장이 없으면 사용자는 공들여
              꾸민 프레임이 날아간 줄 안다. */}
          <p className="text-[11px] leading-[1.6] text-(--hc-muted)">
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
        <p className="mt-2 text-[12px] leading-[1.6] text-(--hc-muted)">
          보관 중인 프레임 {frames.length}개는 지금 고른 것과 컷 구성이 달라요. 위에서 같은
          구성을 고르면 바로 나타나요.
        </p>
      ) : matchingFrames.length === 0 ? (
        <p className="mt-2 text-[12px] text-(--hc-muted)">{emptyText}</p>
      ) : (
        // 폰에서는 한 줄로 넘긴다. 세로로 쌓으면 프레임 몇 개만으로 위의 큰 카드와 아래 버튼이 멀어진다.
        <div className="-mx-2 mt-1 flex gap-2.5 overflow-x-auto px-2 pb-1 scrollbar-none [-ms-overflow-style:none] sm:-mx-4 sm:px-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden">
          {matchingFrames.map((frame) => {
            const isSelected = selectedRemoteFrameId === frame.frameId;
            const previewFrameId = frameIdFromFrameType(frame.frameType);
            const name = frame.title || `프레임 #${frame.frameId}`;

            return (
              <article key={frame.frameId} className="flex w-27 shrink-0 flex-col gap-1.5 md:w-auto">
                <button
                  type="button"
                  onClick={() => onSelectRemoteFrame(frame)}
                  aria-pressed={isSelected}
                  className="flex min-w-0 flex-col gap-1.5 text-left"
                >
                  <span
                    className={[
                      "relative grid aspect-3/4 w-full place-items-center overflow-hidden rounded-xl border bg-(--hc-surface) transition",
                      isSelected
                        ? "border-(--hc-primary-line) shadow-[0_0_0_1px_var(--hc-primary-line)]"
                        : "border-(--hc-border) hover:border-(--hc-border-strong)",
                    ].join(" ")}
                  >
                    {frame.source ? (
                      // 저장본 그림은 칸이 뚫려 있다. 예시 사진을 깔아 칸이 빈 프레임처럼 보이지 않게 한다.
                      <span aria-hidden className="absolute inset-1.5 flex items-center justify-center [container-type:size]">
                        <FrameWithPhotos
                          frame={{ layoutType: frame.frameType, previewUrl: frame.source }}
                          photos={DEMO_PHOTOS}
                          loading="lazy"
                          style={frameFitStyle(frame.frameType)}
                        />
                      </span>
                    ) : (
                      <FramePreview frameId={previewFrameId} className="max-h-full max-w-full" />
                    )}
                    {isSelected ? (
                      <span aria-hidden className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-(--hc-primary) text-(--hc-primary-contrast)">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-[13px] font-semibold text-(--hc-text)">{name}</span>
                </button>

                {onAction ? (
                  <button
                    type="button"
                    onClick={() => onAction(frame)}
                    className="hc-button-secondary inline-flex h-11 items-center justify-center rounded-full border px-3 text-[12px] font-semibold"
                  >
                    {actionLabel}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
