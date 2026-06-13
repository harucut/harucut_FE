"use client";

import { RefreshCw } from "lucide-react";
import { ThemeOverlaySvg } from "@/components/theme/editor/ThemeOverlaySvg";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import { useCaptureFlow } from "./_hooks/useCaptureFlow";

export default function CapturePage() {
  const {
    videoRef,
    canvasRef,
    shutterAudioRef,
    isCameraReady,
    isCheckingCameraPermission,
    isShooting,
    countdown,
    shotCount,
    startCamera,
    startShooting,
    handleShootNow,
    switchCamera,
    canFlipCamera,
    MAX_SHOTS,
  } = useCaptureFlow();

  const { frameId, remoteFrameId, shots, borderColor } = useShootSession();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  const slotCount = layout ? layout.slots.length : 0;
  // 8장을 4칸에 순환 배치하므로, 지금 찍는 칸은 shotCount를 슬롯 수로 나눈 나머지.
  const currentSlotIndex = slotCount > 0 ? shotCount % slotCount : 0;
  // 각 칸에 가장 최근 촬영본을 채워, 실제 프레임이 완성돼 가는 모습을 그대로 보여준다.
  const photoForSlot = (slotIdx: number): string | undefined => {
    if (slotCount === 0) return undefined;
    for (let k = shotCount - 1; k >= 0; k -= 1) {
      if (k % slotCount === slotIdx) return shots[k]?.photo;
    }
    return undefined;
  };

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  const currentSlot = layout ? layout.slots[currentSlotIndex] : null;

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <audio
        ref={shutterAudioRef}
        src="/shutter.mp3"
        preload="auto"
        className="hidden"
      />
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <PageHeader
          backHref="/shoot"
          backLabel="프레임 다시 선택"
          brandHref={accessMode === "guest" ? "/shoot" : "/home"}
        />
        <StepProgress current={2} total={4} label="사진 촬영" />

        <section className="flex flex-col gap-3 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-3">
          <div className="flex items-center justify-between text-[11px] text-[color:var(--hc-muted)]">
            <span>사진과 영상을 함께 촬영해요</span>
            <span className="rounded-full border border-[color:var(--hc-border)] px-2 py-0.5">
              {shotCount} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          {/* 전체 프레임 무대 — 카메라가 프레임 안에서 실제로 차지하는 칸 크기/위치 그대로 보인다. */}
          <div
            className="relative mx-auto flex items-center justify-center"
            style={{ height: "min(58svh, 540px)", width: "100%" }}
          >
            <canvas ref={canvasRef} className="hidden" />

            {layout && currentSlot ? (
              <div
                className="relative overflow-hidden rounded-xl shadow-[var(--hc-card-shadow)]"
                style={{
                  aspectRatio: `${layout.totalWidth} / ${layout.totalHeight}`,
                  backgroundColor: borderColor,
                  height: layout.full === "h-full" ? "100%" : undefined,
                  width: layout.full === "w-full" ? "100%" : undefined,
                  maxWidth: "100%",
                  maxHeight: "100%",
                }}
              >
                {/* 이미 찍은 칸 + 아직 안 찍은 칸 플레이스홀더 (현재 칸은 아래 영상이 덮는다) */}
                {layout.slots.map((slot, idx) => {
                  const photo = idx === currentSlotIndex ? undefined : photoForSlot(idx);
                  return (
                    <div
                      key={idx}
                      className="absolute overflow-hidden rounded-[2px]"
                      style={{
                        left: pct(slot.x, layout.totalWidth),
                        top: pct(slot.y, layout.totalHeight),
                        width: pct(slot.width, layout.totalWidth),
                        height: pct(slot.height, layout.totalHeight),
                        backgroundColor:
                          idx === currentSlotIndex
                            ? "transparent"
                            : "var(--hc-surface-muted)",
                        outline:
                          idx === currentSlotIndex
                            ? "2px solid var(--hc-primary)"
                            : "none",
                        outlineOffset: "-2px",
                      }}
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo}
                          alt={`촬영 ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                  );
                })}

                {/* 라이브 카메라 — 현재 칸 위에 고정 위치로 올려 칸 이동 시에도 스트림이 끊기지 않게 한다. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute z-[5] scale-x-[-1] rounded-[2px] object-cover"
                  style={{
                    left: pct(currentSlot.x, layout.totalWidth),
                    top: pct(currentSlot.y, layout.totalHeight),
                    width: pct(currentSlot.width, layout.totalWidth),
                    height: pct(currentSlot.height, layout.totalHeight),
                  }}
                />

                {/* 프레임 데코 오버레이 (사용자/원격 프레임). 좌표는 합성 결과와 동일. */}
                {themeData ? (
                  <ThemeOverlaySvg
                    layout={layout}
                    data={themeData}
                    className="pointer-events-none absolute inset-0 z-10"
                  />
                ) : null}

                {isShooting && countdown !== null ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40">
                    <div className="pointer-events-auto flex flex-col items-center gap-2">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white text-2xl font-semibold text-white">
                        {countdown}
                      </div>
                      <span className="text-[11px] font-semibold text-white">
                        {shotCount}/{MAX_SHOTS}
                      </span>
                      <button
                        type="button"
                        onClick={handleShootNow}
                        className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[color:var(--hc-primary)] hover:bg-zinc-100"
                      >
                        바로 촬영
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-[color:var(--hc-border)] bg-black text-[11px] text-zinc-400">
                프레임을 먼저 선택해 주세요
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-[color:var(--hc-muted)]">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  isCameraReady ? "bg-[color:var(--hc-primary)]" : "bg-zinc-500"
                }`}
              />
              <span>카메라 {isCameraReady ? "준비 완료" : "아직 켜져 있지 않아요"}</span>
            </div>
            <div className="flex items-center gap-2">
              {canFlipCamera ? (
                <button
                  type="button"
                  onClick={() => void switchCamera()}
                  className="rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3 py-1.5 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    카메라 전환
                  </span>
                </button>
              ) : null}
              {!isCameraReady && !isCheckingCameraPermission ? (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3 py-1.5 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)]"
                >
                  카메라 켜기
                </button>
              ) : null}
              <button
                type="button"
                onClick={startShooting}
                disabled={!isCameraReady || isShooting}
                className="hc-button-primary rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isShooting ? "촬영 중..." : "촬영 시작"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
