"use client";

import { RefreshCw, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
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

                {/*
                  촬영 중에는 화면에 카운트다운만 남는다. 셔터를 따로 두지 않으므로
                  "기다리지 않고 지금 찍기"는 이 화면을 눌러 쓴다 — 카메라 앱에서
                  화면을 누르는 것과 같다. 대기 건너뛰기 기능은 그대로 살아 있다.
                */}
                {isShooting && countdown !== null ? (
                  <button
                    type="button"
                    onClick={handleShootNow}
                    aria-label="기다리지 않고 지금 촬영"
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/40"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white text-2xl font-semibold text-white">
                      {countdown}
                    </span>
                    <span className="text-[11px] font-semibold text-white">
                      {shotCount}/{MAX_SHOTS}
                    </span>
                  </button>
                ) : null}

                {/*
                  촬영 컨트롤은 **무대 안 아래쪽**에 얹는다. 밖에 두면 그만큼 카메라가 줄고,
                  셔터가 화면 아래로 내려가 자기 얼굴을 보면서 누르기 어려워진다.

                  버튼 모양은 위 "카메라 켜기"와 같은 알약이다 — 켜고 → 찍는, 이어지는 한
                  동작이라 생김새가 같아야 한다.

                  시작하면 통째로 사라진다. 그때부터 이 화면이 할 일은 카메라를 보여 주는
                  것뿐이다. 영상 위에 얹히므로 아래쪽에 어두운 그라데이션을 깔고 칩에도
                  각자 불투명 배경을 줘서, 뒤에 무엇이 오든 읽히게 한다.
                */}
                {isCameraReady && !isShooting ? (
                  <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-4 pt-12">
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

                    {/* 전환은 absolute 로 빼서, 촬영 버튼이 그 유무와 무관하게 정중앙에 온다. */}
                    <div className="relative flex w-full items-center justify-center">
                      {canFlipCamera ? (
                        <button
                          type="button"
                          onClick={() => void switchCamera()}
                          className="absolute left-0 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-[11px] font-semibold text-white ring-1 ring-white/30"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          전환
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={startShooting}
                        className="hc-button-primary inline-flex h-12 items-center rounded-full px-7 text-[15px] font-extrabold"
                      >
                        촬영 시작
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

          {/*
            무대 밖에는 아무것도 두지 않는다. 촬영 스트립·간격 칩·셔터·안내 문구가 모두
            여기 있었는데, 찍은 사진은 다음 화면에서 크게 보고 고르고 나머지는 무대 안으로
            옮겼다. 화면이 통째로 카메라가 된다.
          */}
        </section>
      </div>
    </main>
  );
}
