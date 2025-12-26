"use client";

import { useCaptureFlow } from "./_hooks/useCaptureFlow";
import { PageHeader } from "@/components/layout/PageHeader";

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
    MAX_SHOTS,
    MAX_COUNT,
  } = useCaptureFlow();

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
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
        />
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>2단계 · 카메라 촬영 {isShooting && "· 자동 촬영 중"}</span>
            <span className="rounded-full border border-zinc-700 px-2 py-0.5">
              {shotCount} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain scale-x-[-1]"
            />
            <canvas ref={canvasRef} className="hidden" />

            {isShooting && countdown !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400 text-2xl font-semibold">
                    {countdown}
                  </div>
                  <span className="text-xs text-zinc-200">
                    다음 촬영까지 남은 시간
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    남은 사진 {remainingShots}장
                  </span>
                  <button
                    type="button"
                    onClick={handleShootNow}
                    className="mt-2 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400"
                  >
                    지금 촬영
                  </button>
                </div>
              </div>
            )}

            {!isShooting && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                <p className="px-4 text-center text-[11px] text-zinc-200">
                  카메라를 켜고{" "}
                  <span className="font-semibold">
                    &quot;{MAX_SHOTS}장 자동 촬영 시작&quot;
                  </span>{" "}
                  버튼을 누르면
                  <br />
                  {MAX_COUNT}초 간격으로 사진과 영상을 함께 촬영해요.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  isCameraReady ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              <span>
                카메라 {isCameraReady ? "준비 완료" : "아직 꺼져 있어요"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
              >
                카메라 켜기
              </button>
              <button
                type="button"
                onClick={startShooting}
                disabled={!isCameraReady || isShooting}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
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
