"use client";

import { RefreshCw, Timer } from "lucide-react";
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

            {/* 큰 원형 셔터: 타이머 모드는 '촬영 시작'(이후 자동 잠금), 수동 모드는 누를 때마다 한 장씩 */}
            <button
              type="button"
              onClick={
                captureMode === "manual" ? handleManualShutter : startShooting
              }
              disabled={
                !isCameraReady || (captureMode === "timer" && isShooting)
              }
              aria-label={captureMode === "manual" ? "한 장 촬영" : "촬영 시작"}
              className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-[color:var(--hc-text)] bg-transparent transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="h-[54px] w-[54px] rounded-full bg-[color:var(--hc-primary)]" />
            </button>

            <span className="inline-block w-[68px]" />
          </div>

          <p className="text-center text-[11px] text-[color:var(--hc-muted)]">
            {captureMode === "timer"
              ? `촬영 시작을 누르면 ${timerSeconds}초 간격으로 8장을 자동으로 찍어요`
              : "셔터를 누를 때마다 한 장씩 총 8장을 찍어요"}
          </p>
        </section>
      </div>
    </main>
  );
}
