"use client";

import { useMemo } from "react";
import { RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useShootSession } from "@/lib/shootSessionStore";
import { useStageFit } from "@/hooks/useStageFit";
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
    timerSeconds,
    setTimerSeconds,
    startCamera,
    startShooting,
    handleShootNow,
    switchCamera,
    canFlipCamera,
    cameraFacingMode,
    MAX_SHOTS,
    TIMER_OPTIONS,
  } = useCaptureFlow();

  const { frameId, shots, eventName } = useShootSession();
  const layout = frameId ? FRAME_LAYOUTS[frameId] : null;

  // 찍은 컷이 있는데 아직 저장 전이면, 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

  const slotCount = layout ? layout.slots.length : 0;
  // 8장을 4칸에 순환 배치하므로, 지금 찍는 칸은 shotCount를 슬롯 수로 나눈 나머지.
  const currentSlotIndex = slotCount > 0 ? shotCount % slotCount : 0;
  // 촬영 중에는 프레임을 씌우지 않고, 선택한 프레임의 슬롯 비율만 프리뷰에 반영한다.
  // 프레임(테두리·데코)은 사진을 배치하는 다음 단계부터 보인다.
  const currentSlot = layout ? layout.slots[currentSlotIndex] : null;

  /*
    프리뷰 무대를 슬롯 비율 그대로, 남은 공간 안에 넣는다.

    예전에는 `aspectRatio` 에 `height:100%` 와 `maxWidth:100%` 를 같이 걸었다. 높이가
    고정된 상태에서 가로가 상한에 걸리면 두 축이 모두 확정돼 `aspect-ratio` 가 무시된다.
    실측으로 세로 4컷(슬롯 1700×1200, 가로 1.42)이 422×528(세로 0.80)로 그려졌다 —
    프리뷰는 세로로 긴 화면을 보여 주는데 `capturePhotoToDataUrl` 은 같은 영상을 슬롯
    비율로 가운데 잘라 저장하니, 본 것과 찍힌 것이 서로 다른 그림이 됐다.

    그래서 두 축을 CSS 에 맡기지 않고 컨테이너 실측값으로 한 번에 계산한다.
    이제 프리뷰의 잘림과 저장본의 잘림이 같은 사각형이다.
  */
  // 매 렌더마다 새 객체를 넘기면 useStageFit 의 메모가 계속 깨진다.
  const stageBase = useMemo(
    () =>
      currentSlot
        ? { width: currentSlot.width, height: currentSlot.height }
        : null,
    [currentSlot],
  );
  const {
    containerRef: stageRef,
    viewW,
    viewH,
    ready: stageReady,
  } = useStageFit(stageBase, { fitToContainerHeight: true });

  const backToFrameHref = (() => {
    const params = new URLSearchParams();
    if (frameId) params.set("frame", frameId);
    if (eventName) params.set("event", eventName);
    const query = params.toString();
    return query ? `/shoot?${query}` : "/shoot";
  })();

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
          // 고른 컷 구성과 행사 맥락을 들고 돌아간다. 맨 주소로 보내면 둘 다 초기화된다.
          backHref={backToFrameHref}
          backLabel="프레임 다시 선택"
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <section className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-3">
          {/*
            "N / 8장 촬영됨" 칩은 걷어냈다. 시작 전에는 언제나 0/8 이라 알려 줄 것이 없고,
            촬영 중에는 카운트다운 바로 아래에 같은 숫자가 뜬다.
          */}

          {/* 카메라 무대 — 프레임 없이, 선택한 프레임 슬롯과 같은 비율의 프리뷰만 보여준다. */}
          <div
            ref={stageRef}
            className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center"
          >
            <canvas ref={canvasRef} className="hidden" />

            {layout && currentSlot ? (
              <div
                className="relative overflow-hidden rounded-xl bg-black shadow-[var(--hc-card-shadow)]"
                /*
                  실측한 컨테이너에 슬롯 비율을 그대로 넣은 크기다. 여기 보이는 사각형이
                  곧 저장되는 사각형이다.

                  첫 페인트(측정 전)에는 aspectRatio 로만 잡아 둔다. 가로를 기준으로 두므로
                  이 순간에도 비율은 맞고, 세로가 넘칠 수 있는 구간만 측정 후 줄어든다.
                */
                style={
                  stageReady
                    ? { width: viewW, height: viewH }
                    : {
                        width: "100%",
                        aspectRatio: `${currentSlot.width} / ${currentSlot.height}`,
                      }
                }
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
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-black/35">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white text-2xl font-semibold text-white">
                      {countdown}
                    </span>
                    <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {shotCount}/{MAX_SHOTS}
                    </span>
                  </div>
                ) : null}

                {/*
                  촬영 관련 컨트롤은 **무대 한가운데**에 얹는다 — 바로 위 "카메라 켜기"가
                  섰던 그 자리다. 켜고 → 찍는, 이어지는 한 동작이라 같은 자리·같은 알약
                  모양이어야 한다.

                  시작하면 사라진다. 둘 다 "시작하기 전에 정하는 것"이라, 시작한 뒤에는
                  화면에 남을 이유가 없다 — 그때부터 이 화면이 할 일은 카메라를 보여 주는
                  것뿐이다.

                  영상 위에 얹히므로 칩·버튼에 각자 불투명 배경을 줘서 뒤에 무엇이 오든
                  읽히게 한다.
                */}
                {isCameraReady && !isShooting ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-3">
                    <div className="flex items-center justify-center gap-2">
                      {TIMER_OPTIONS.map((seconds) => {
                        const active = timerSeconds === seconds;
                        return (
                          <button
                            key={seconds}
                            type="button"
                            onClick={() => setTimerSeconds(seconds)}
                            aria-pressed={active}
                            className={`inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition ${
                              active
                                ? "bg-white text-[#0B0B0C]"
                                : "bg-black/55 text-white ring-1 ring-white/30"
                            }`}
                          >
                            <Timer className="h-3.5 w-3.5" />
                            {seconds}s
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={startShooting}
                      className="hc-button-primary inline-flex h-12 items-center rounded-full px-7 text-[15px] font-extrabold"
                    >
                      촬영 시작
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-[color:var(--hc-border)] bg-black text-[11px] text-zinc-400">
                프레임을 먼저 선택해 주세요
              </div>
            )}
          </div>

          {/*
            무대 아래 셔터. 촬영 중에는 이것이 "기다리지 않고 지금 한 컷"이 된다(#404).
            무대 안의 알약은 시작 전용이라 촬영이 시작되면 회색이 되므로, 촬영 중에 실제로
            누르는 버튼은 여기다.

            전환 버튼은 absolute 로 빼서, 셔터가 그 유무와 무관하게 항상 정중앙에 온다.
          */}
          <div className="relative flex items-center justify-center">
            {canFlipCamera ? (
              <button
                type="button"
                onClick={() => void switchCamera()}
                disabled={isShooting}
                className="absolute left-0 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1.5 rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-3.5 text-[11px] text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                전환
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleShootNow}
              // 이 버튼이 하는 일은 "기다리지 않고 지금 한 컷"이라, 촬영이 돌고 있을 때만
              // 할 수 있는 일이다. 시작 전에는 눌러도 할 일이 없으므로 회색으로 둔다 —
              // 시작은 무대 한가운데 알약이 맡는다.
              disabled={!isCameraReady || !isShooting}
              // 이 버튼이 하는 일은 하나뿐이라 이름도 하나다(시작은 무대 안 알약이 맡는다).
              // 화면에서 글자가 빠져도 보조기술에는 남아야 한다.
              aria-label="바로 촬영"
              className="flex flex-col items-center gap-1.5 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-[color:var(--hc-text)] [@media(max-height:700px)]:h-[60px] [@media(max-height:700px)]:w-[60px]">
                <span className="h-[54px] w-[54px] rounded-full bg-[color:var(--hc-primary)] [@media(max-height:700px)]:h-[44px] [@media(max-height:700px)]:w-[44px]" />
              </span>
              {/*
                글자는 두지 않는다. 시작은 무대 한가운데 알약이 맡고, 이 동그라미는
                촬영이 돌 때만 살아나는 셔터라 설명이 없어도 무엇인지 안다.
                이름은 aria-label 로 남아 보조기술에는 계속 읽힌다.
              */}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
