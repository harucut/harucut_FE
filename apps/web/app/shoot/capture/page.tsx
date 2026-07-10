"use client";

import { RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
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
    captureMode,
    setCaptureMode,
    timerSeconds,
    setTimerSeconds,
    startCamera,
    startShooting,
    handleShootNow,
    handleManualShutter,
    switchCamera,
    canFlipCamera,
    MAX_SHOTS,
    TIMER_OPTIONS,
  } = useCaptureFlow();

  const { frameId, shots } = useShootSession();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  const slotCount = layout ? layout.slots.length : 0;
  // 8장을 4칸에 순환 배치하므로, 지금 찍는 칸은 shotCount를 슬롯 수로 나눈 나머지.
  const currentSlotIndex = slotCount > 0 ? shotCount % slotCount : 0;
  // 촬영 중에는 프레임을 씌우지 않고, 선택한 프레임의 슬롯 비율만 프리뷰에 반영한다.
  // 프레임(테두리·데코)은 사진을 배치하는 다음 단계부터 보인다.
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
            <span>사진을 촬영해요</span>
            <span className="rounded-full border border-[color:var(--hc-border)] px-2 py-0.5">
              {shotCount} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          {/* 카메라 무대 — 프레임 없이, 선택한 프레임 슬롯과 같은 비율의 프리뷰만 보여준다. */}
          <div
            className="relative mx-auto flex items-center justify-center"
            style={{ height: "min(58svh, 540px)", width: "100%" }}
          >
            <canvas ref={canvasRef} className="hidden" />

            {layout && currentSlot ? (
              <div
                className="relative overflow-hidden rounded-xl bg-black shadow-[var(--hc-card-shadow)]"
                style={{
                  aspectRatio: `${currentSlot.width} / ${currentSlot.height}`,
                  width: `min(100%, calc(min(58svh, 540px) * ${currentSlot.width / currentSlot.height}))`,
                }}
              >
                {/* 라이브 카메라 — 촬영 결과물과 같은 center-crop(object-cover)으로 슬롯 비율을 채운다. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
                />

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

          {/* 찍은 컷 미리보기 — 프레임 없이 촬영하므로 진행 상황은 썸네일로 보여준다. */}
          {shots.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {shots.map((shot, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={shot.photo}
                  alt={`촬영 ${idx + 1}`}
                  className="h-10 w-10 rounded-md border border-[color:var(--hc-border)] object-cover"
                />
              ))}
            </div>
          ) : null}

          {/* 촬영 모드: 타이머 / 수동. 촬영이 시작되면 잠긴다. */}
          <div className="mx-auto flex w-full max-w-[280px] items-center gap-1.5 rounded-full bg-[color:var(--hc-surface-muted)] p-1">
            {(
              [
                ["timer", "타이머"],
                ["manual", "수동"],
              ] as const
            ).map(([mode, label]) => {
              const active = captureMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCaptureMode(mode)}
                  disabled={isShooting}
                  aria-pressed={active}
                  className={`flex h-9 flex-1 items-center justify-center rounded-full text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? "bg-white text-[#0B0B0C] shadow-sm"
                      : "text-[color:var(--hc-muted)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* 타이머 간격 칩(3/5/8초). 타이머 모드에서만 노출되고, 촬영 시작 후에는 잠긴다. */}
          {captureMode === "timer" ? (
            <div className="flex items-center justify-center gap-2">
              {TIMER_OPTIONS.map((seconds) => {
                const active = timerSeconds === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => setTimerSeconds(seconds)}
                    disabled={isShooting}
                    aria-pressed={active}
                    className={`inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? "bg-white text-[#0B0B0C]"
                        : "bg-[color:var(--hc-surface-muted)] text-[color:var(--hc-text)]"
                    }`}
                  >
                    <Timer className="h-3.5 w-3.5" />
                    {seconds}s
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* 셔터/시작 영역 */}
          <div className="flex items-center justify-center gap-5">
            {canFlipCamera ? (
              <button
                type="button"
                onClick={() => void switchCamera()}
                disabled={isShooting}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3.5 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                전환
              </button>
            ) : null}

            {!isCameraReady && !isCheckingCameraPermission ? (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="inline-flex h-10 items-center rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-4 text-[12px] font-semibold text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)]"
              >
                카메라 켜기
              </button>
            ) : null}

            {/* 큰 원형 셔터: 수동은 누를 때마다 한 장씩. 타이머는 시작 전엔 '촬영 시작',
                카운트다운 중엔 탭하면 남은 대기를 스킵하고 그 컷을 즉시 촬영한다. */}
            <button
              type="button"
              onClick={
                captureMode === "manual"
                  ? handleManualShutter
                  : isShooting
                    ? handleShootNow
                    : startShooting
              }
              disabled={!isCameraReady}
              aria-label={
                captureMode === "manual"
                  ? "한 장 촬영"
                  : isShooting
                    ? "지금 바로 촬영"
                    : "촬영 시작"
              }
              className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-[color:var(--hc-text)] bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="h-[54px] w-[54px] rounded-full bg-[color:var(--hc-primary)]" />
            </button>

            <span className="inline-block w-[68px]" />
          </div>

          <p className="text-center text-[11px] text-[color:var(--hc-muted)]">
            {captureMode === "timer"
              ? isShooting
                ? "셔터를 누르면 기다리지 않고 바로 이 컷을 찍어요"
                : `촬영 시작을 누르면 ${timerSeconds}초 간격으로 8장을 자동으로 찍어요`
              : "셔터를 누를 때마다 한 장씩 총 8장을 찍어요"}
          </p>
        </section>
      </div>
    </main>
  );
}
