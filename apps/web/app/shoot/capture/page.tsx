"use client";

import { RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FlowSteps } from "@/components/layout/FlowSteps";
import { SHOOT_FLOW_STEPS } from "@/constants/flowSteps";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
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
    remainingShots,
    timerSeconds,
    setTimerSeconds,
    startCamera,
    startShooting,
    handleShootNow,
    cancelShooting,
    switchCamera,
    canFlipCamera,
    cameraFacingMode,
    MAX_SHOTS,
    TIMER_OPTIONS,
  } = useCaptureFlow();

  const { frameId, shots, eventName } = useShootSession();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  // 찍은 컷이 있는데 아직 저장 전이면, 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  const slotCount = layout ? layout.slots.length : 0;
  // 8장을 4칸에 순환 배치하므로, 지금 찍는 칸은 shotCount를 슬롯 수로 나눈 나머지.
  const currentSlotIndex = slotCount > 0 ? shotCount % slotCount : 0;
  // 촬영 중에는 프레임을 씌우지 않고, 선택한 프레임의 슬롯 비율만 프리뷰에 반영한다.
  // 프레임(테두리·데코)은 사진을 배치하는 다음 단계부터 보인다.
  const currentSlot = layout ? layout.slots[currentSlotIndex] : null;
  // 8장을 다 찍으면 곧바로 다음 화면으로 넘어가므로, 표시용 번호는 MAX_SHOTS에서 멈춘다.
  const currentShotNumber = Math.min(shotCount + 1, MAX_SHOTS);

  return (
    /*
      촬영 화면은 스크롤하지 않는다. 프리뷰와 셔터가 한 화면에 같이 보여야 하는데,
      390×844 폰에서 셔터가 화면 아래 186px 지점에 있었다(실측). 자기 얼굴을 보면서
      셔터를 누를 수가 없었다. 높이를 뷰포트에 묶고 남는 공간을 프리뷰가 가져간다.
    */
    <main className="hc-page-app flex h-dvh flex-col overflow-hidden px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[color:var(--hc-text)]">
      <audio
        ref={shutterAudioRef}
        src="/shutter.mp3"
        preload="auto"
        className="hidden"
      />
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3">
        <PageHeader
          title="사진 촬영"
          description={`${MAX_SHOTS}장을 찍고 다음 단계에서 4장을 골라요.`}
          backHref="/shoot"
          backLabel="프레임 다시 선택"
          brandHref={accessMode === "guest" ? "/shoot" : "/home"}
        />

        <FlowSteps steps={SHOOT_FLOW_STEPS} current={1} />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <section className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-3">
          <div className="flex items-center justify-between text-[11px] text-[color:var(--hc-muted)]">
            <span>사진을 촬영해요</span>
            <span className="rounded-full border border-[color:var(--hc-border)] px-2 py-0.5">
              {shotCount} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          {/* 카메라 무대 — 프레임 없이, 선택한 프레임 슬롯과 같은 비율의 프리뷰만 보여준다. */}
          <div className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center">
            <canvas ref={canvasRef} className="hidden" />

            {layout && currentSlot ? (
              <div
                className="relative overflow-hidden rounded-xl bg-black shadow-[var(--hc-card-shadow)]"
                // 남는 높이를 다 쓰되 가로를 넘지 않게. 비율은 고른 프레임의 칸 비율 그대로.
                style={{
                  aspectRatio: `${currentSlot.width} / ${currentSlot.height}`,
                  maxHeight: "100%",
                  maxWidth: "100%",
                  height: "100%",
                }}
              >
                {/* 라이브 카메라 — 촬영 결과물과 같은 center-crop(object-cover)으로 슬롯 비율을 채운다.
                    전면(user) 카메라만 좌우반전(셀피 감각), 후면은 그대로. */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 h-full w-full object-cover ${
                    cameraFacingMode === "user" ? "scale-x-[-1]" : ""
                  }`}
                />

                {/* 지금 어느 칸을 찍는지 — 8장이 4칸을 순환하므로 칸 번호를 항상 보여준다. */}
                {slotCount > 0 ? (
                  <span className="absolute left-2 top-2 z-30 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                    {currentSlotIndex + 1}번째 칸 · {currentShotNumber}번째 컷
                  </span>
                ) : null}

                {/*
                  카메라가 아직 안 켜졌을 때 검은 사각형만 보였다. 무슨 일이 일어나는지,
                  다음에 무엇이 필요한지 무대 안에서 말한다.
                */}
                {!isCameraReady ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                    {isCheckingCameraPermission ? (
                      <p className="text-[13px] font-semibold text-white">
                        카메라를 준비하고 있어요…
                      </p>
                    ) : (
                      <>
                        <p className="text-[13px] font-semibold leading-[1.6] text-white">
                          카메라를 켜면 여기에 화면이 보여요.
                          <br />
                          <span className="font-normal text-white/70">
                            브라우저가 카메라 사용을 물어보면 허용해 주세요.
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="hc-button-primary inline-flex h-10 items-center rounded-full px-5 text-[13px] font-bold"
                        >
                          카메라 켜기
                        </button>
                      </>
                    )}
                  </div>
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

          {/* 촬영 진행 스트립 — 프레임 없이 찍으므로, 몇 장을 찍었고 각 컷이 어느 칸에 들어가는지
              여기서 보여준다. 아직 안 찍은 자리는 빈 칸으로 남겨 전체 진행도를 함께 읽게 한다. */}
          <div
            className="flex flex-wrap items-center justify-center gap-1.5"
            aria-label={`촬영 진행 ${shotCount} / ${MAX_SHOTS}장`}
          >
            {Array.from({ length: MAX_SHOTS }, (_, index) => {
              // 스토어보다 shotCount를 기준으로 잘라, 배지와 스트립이 어긋나지 않게 한다.
              const shotPhoto = index < shotCount ? shots[index] : undefined;
              const isCurrent = index === shotCount;
              const slotNumber =
                slotCount > 0 ? (index % slotCount) + 1 : index + 1;

              return (
                <div
                  key={index}
                  className={`relative h-10 w-10 overflow-hidden rounded-md border bg-[color:var(--hc-surface-muted)] [@media(max-height:700px)]:h-8 [@media(max-height:700px)]:w-8 ${
                    isCurrent
                      ? "border-[color:var(--hc-primary)]"
                      : "border-[color:var(--hc-border)]"
                  }`}
                >
                  {shotPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shotPhoto}
                      alt={`촬영 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[11px] font-semibold text-white">
                    {slotNumber}
                  </span>
                </div>
              );
            })}
          </div>
          {/* 촬영 간격 칩(3/5/8초) — 시작 전에만 고른다.
              촬영 중에도 자리를 지키고 비활성으로만 두어 레이아웃이 흔들리지 않게 한다.
              한 화면에 셔터까지 담아야 해서 라벨을 칩과 같은 줄에 둔다. */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] font-semibold text-[color:var(--hc-muted)]">
              촬영 간격
            </span>
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
          </div>

          {/* 셔터 영역 — 전환 버튼은 absolute로 빼서, 메인 버튼이 그 유무와 무관하게
              항상 좌우 정중앙에 오게 한다(예전 flex+스페이서 방식은 중앙이 어긋났다). */}
          <div className="relative flex items-center justify-center">
            {canFlipCamera ? (
              <button
                type="button"
                onClick={() => void switchCamera()}
                disabled={isShooting}
                className="absolute left-0 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1.5 rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3.5 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                전환
              </button>
            ) : null}

            {/* 시작 전엔 '촬영 시작', 촬영 중엔 언제든 눌러 남은 대기를 건너뛰고 즉시 한 컷. */}
            <button
              type="button"
              onClick={isShooting ? handleShootNow : startShooting}
              disabled={!isCameraReady}
              className="flex flex-col items-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-[color:var(--hc-text)] [@media(max-height:700px)]:h-[60px] [@media(max-height:700px)]:w-[60px]">
                <span className="h-[54px] w-[54px] rounded-full bg-[color:var(--hc-primary)] [@media(max-height:700px)]:h-[44px] [@media(max-height:700px)]:w-[44px]" />
              </span>
              <span className="text-[12px] font-bold">
                {isShooting ? "바로 촬영" : "촬영 시작"}
              </span>
            </button>

            {/* 촬영 취소 — 8초 간격이면 8장에 1분 가까이 걸린다. 중단 수단을 항상 열어 둔다. */}
            {isShooting ? (
              <button
                type="button"
                onClick={cancelShooting}
                className="absolute right-0 top-1/2 inline-flex h-10 -translate-y-1/2 items-center rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3.5 text-[11px] font-semibold text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)]"
              >
                촬영 취소
              </button>
            ) : null}
          </div>

          <p className="text-center text-[11px] leading-[1.5] text-[color:var(--hc-muted)] [@media(max-height:700px)]:hidden">
            {isShooting
              ? `${timerSeconds}초 간격으로 남은 ${remainingShots}장을 자동으로 찍어요. 셔터를 누르면 바로 찍고, 취소하면 지금까지 찍은 ${shotCount}장은 지워져요.`
              : `촬영 시작을 누르면 ${timerSeconds}초 간격으로 ${MAX_SHOTS}장을 자동으로 찍어요. 아래 작은 숫자는 프레임에서 들어갈 칸이에요.`}
          </p>
        </section>
      </div>
    </main>
  );
}
