"use client";

import { RefreshCw } from "lucide-react";
import { ThemeOverlaySvg } from "@/components/theme/editor/ThemeOverlaySvg";
import { PageHeader } from "@/components/layout/PageHeader";
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
    isShooting,
    countdown,
    shotCount,
    remainingShots,
    startCamera,
    startShooting,
    handleShootNow,
    switchCamera,
    canFlipCamera,
    MAX_SHOTS,
    MAX_COUNT,
  } = useCaptureFlow();

  const { frameId, remoteFrameId } = useShootSession();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  const currentSlot =
    layout && layout.slots.length > 0
      ? layout.slots[shotCount % layout.slots.length]
      : null;

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
          title="사진 촬영 · 8장 자동 촬영"
          backHref="/shoot"
          backLabel="프레임 다시 선택"
          brandHref={accessMode === "guest" ? "/shoot" : "/home"}
          description={
            accessMode === "guest"
              ? "비회원 체험에서는 촬영 후 이미지 다운로드까지만 바로 이용할 수 있어요."
              : undefined
          }
        />

        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>2단계 · 카메라 촬영 {isShooting && "· 자동 촬영 중"}</span>
            <span className="rounded-full border border-zinc-700 px-2 py-0.5">
              {shotCount} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          <div
            className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black"
            style={{
              aspectRatio: currentSlot
                ? `${currentSlot.width} / ${currentSlot.height}`
                : "3 / 4",
            }}
          >
            <canvas ref={canvasRef} className="hidden" />

            {layout && currentSlot ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
                {themeData ? (
                  <ThemeOverlaySvg
                    layout={layout}
                    data={themeData}
                    className="pointer-events-none absolute inset-0 z-10"
                    viewBox={currentSlot}
                  />
                ) : null}
              </>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full scale-x-[-1] object-cover"
              />
            )}

            {isShooting && countdown !== null ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--hc-primary)] text-2xl font-semibold">
                    {countdown}
                  </div>
                  <span className="text-xs text-zinc-200">다음 촬영까지 남은 시간</span>
                  <span className="text-[11px] text-zinc-400">남은 사진 {remainingShots}장</span>
                  <button
                    type="button"
                    onClick={handleShootNow}
                    className="hc-button-primary mt-2 rounded-full px-3 py-1 text-[11px] font-semibold"
                  >
                    지금 촬영
                  </button>
                </div>
              </div>
            ) : null}

            {!isShooting ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                <p className="px-4 text-center text-[11px] text-zinc-200">
                  카메라를 켜고 <span className="font-semibold">&quot;8장 자동 촬영 시작&quot;</span>{" "}
                  버튼을 누르면 {MAX_COUNT}초 간격으로 사진과 영상을 함께 촬영해요.
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
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
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    카메라 전환
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void startCamera()}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
              >
                카메라 켜기
              </button>
              <button
                type="button"
                onClick={startShooting}
                disabled={!isCameraReady || isShooting}
                className="hc-button-primary rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isShooting ? "촬영 중..." : "8장 자동 촬영 시작"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
