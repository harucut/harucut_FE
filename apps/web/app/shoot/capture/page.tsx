"use client";

import { useMemo, useSyncExternalStore } from "react";
import { SwitchCamera, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { isNativeShell } from "@/lib/nativeBridge";
import { useShootSession } from "@/lib/shootSessionStore";
import { useDarkStage } from "@/hooks/useDarkStage";
import { useStageFit } from "@/hooks/useStageFit";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { useCaptureFlow } from "./_hooks/useCaptureFlow";

const subscribeNever = () => () => undefined;

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
  // 앱 셸 안인지는 클라이언트에서만 알 수 있다. 서버 스냅샷은 false 로 두어 하이드레이션이 어긋나지 않게 한다.
  const inShell = useSyncExternalStore(subscribeNever, isNativeShell, () => false);

  // 뷰파인더는 테마와 무관하게 검다(DESIGN.md 「테마 정책」의 예외 하나). 상태바도 그동안 다크.
  useDarkStage();

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

      화면 전체가 뷰파인더다. 예전에는 테두리·패딩이 있는 회색 카드 안에 프리뷰가 떴고,
      세로 4컷은 슬롯이 가로라 카드의 위아래 절반이 "빈 카드"로 읽혔다. 카드를 걷어내고
      검은 면 하나로 두면 남는 공간이 카메라의 어두운 면이 된다 — 카메라 앱이 그렇다.
      테마와 무관하게 어둡다(hc-stage-dark): 밝은 면 위의 프리뷰는 액자처럼 보이고,
      셔터와 게이지가 사진보다 밝아진다.
    */
    <main className="hc-stage-dark flex h-dvh flex-col overflow-hidden bg-[#0B0B0C] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white">
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

        {/*
          8컷 게이지. 몇 장을 찍는지·몇 장 찍었는지가 늘 보인다(DESIGN.md 「필름의 리듬」).
          찍은 칸은 초록 면, 지금 찍는 칸은 초록 테두리. 숫자 라벨은 두지 않는다 — 칸이 곧 숫자다.
          게이지의 초록은 DESIGN.md 가 '진행 게이지' 용도로 허용한 것이라 한 화면 한 초록 규칙과
          부딪히지 않는다.
        */}
        <div
          role="img"
          aria-label={`${MAX_SHOTS}컷 중 ${shotCount}컷 촬영됨`}
          className="flex shrink-0 items-center justify-center gap-1.5"
        >
          {Array.from({ length: MAX_SHOTS }, (_, index) => {
            const done = index < shotCount;
            const current = isShooting && index === shotCount;
            return (
              <span
                key={index}
                className={`h-7.5 w-5.5 rounded-[5px] border-[1.5px] transition-colors ${
                  done
                    ? "border-(--hc-primary) bg-(--hc-primary)"
                    : current
                      ? "border-(--hc-primary) bg-transparent shadow-[0_0_0_3px_rgba(30,215,96,0.22)]"
                      : "border-[rgba(255,255,255,0.28)] bg-[rgba(255,255,255,0.04)]"
                }`}
              />
            );
          })}
        </div>

        {/* 카메라 무대 — 프레임 없이, 선택한 프레임 슬롯과 같은 비율의 프리뷰만 보여준다. */}
        <div
          ref={stageRef}
          className="relative mx-auto flex min-h-0 w-full flex-1 items-center justify-center"
        >
          <canvas ref={canvasRef} className="hidden" />

          {layout && currentSlot ? (
            <div
              className="relative overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
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
                프리뷰 위에 얹는 것은 둘뿐이다 — 카메라가 꺼져 있을 때의 안내와 카운트다운.
                타이머 칩과 시작 버튼은 얼굴 위가 아니라 아래 띠에 있다. 카메라를 켜면 프리뷰는
                프리뷰만 보여 준다.
              */}
              {!isCameraReady ? (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-6 text-center">
                  <p className="text-[13px] font-semibold leading-[1.6] text-white">
                    {isCheckingCameraPermission ? (
                      "카메라를 준비하고 있어요…"
                    ) : (
                      <>
                        카메라를 켜면 여기에 화면이 보여요.
                        <br />
                        <span className="font-normal text-white/70">
                          {inShell
                            ? "앱이 카메라 사용을 물어보면 허용해 주세요."
                            : "브라우저가 카메라 사용을 물어보면 허용해 주세요."}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              ) : null}

              {/*
                찍힌 순간의 플래시. 카운트다운은 여기 없다 — 아래 띠에 있다(그 자리 주석 참고).
                컷마다 새로 재생하려고 shotCount 로 키를 준다.
              */}
              {shotCount > 0 ? (
                <span
                  key={shotCount}
                  aria-hidden
                  className="hc-capture-flash pointer-events-none absolute inset-0 z-20 bg-white"
                />
              ) : null}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-(--hc-border) bg-black text-[11px] text-zinc-400">
              프레임을 먼저 선택해 주세요
            </div>
          )}
        </div>

        {/*
          간격을 **고르던 자리에서 그 간격을 센다.** 시작 전에는 3·5·8초 칩, 촬영 중에는 남은 초.

          카운트다운이 프리뷰 밖에 있는 이유:
            - 얼굴을 가리지 않는다. 예전 링(96px)은 세로 4컷 프리뷰 높이의 38% 를 덮었다.
            - 대비가 보장된다. 무대 배경(#0B0B0C) 위라 뒤에 뭐가 찍히든 흰 글자가 읽힌다.
              얼굴 위에 있을 때는 밝은 하늘 앞에서 1.4:1 까지 떨어졌고, 그걸 가리려고 화면을
              30% 어둡게 덮어야 했다 — 그 스크림도 같이 사라졌다.
            - 초록이 하나로 돌아온다. 진행 초록은 위 8컷 게이지가 혼자 갖는다.
          높이를 72px 로 고정해 두 상태가 같은 자리를 쓴다 — 시작해도 아래 띠가 움직이지 않는다.
        */}
        <div className="flex h-18 shrink-0 items-center justify-center gap-2">
          {isShooting ? (
            // key 로 매 초 애니메이션을 새로 재생한다 — 링의 연속 스윕을 대신하는 메트로놈.
            <span
              key={countdown ?? 0}
              className="hc-count-tick text-[56px] font-extrabold leading-none tabular-nums text-white"
            >
              {countdown}
            </span>
          ) : (
            TIMER_OPTIONS.map((seconds) => {
              const active = timerSeconds === seconds;
              return (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => setTimerSeconds(seconds)}
                  aria-pressed={active}
                  className={`inline-flex h-11 items-center gap-1 rounded-full px-4 text-[13px] font-semibold tabular-nums transition ${
                    active
                      ? "bg-white text-[#0B0B0C]"
                      : "bg-transparent text-white ring-1 ring-[rgba(255,255,255,0.3)]"
                  }`}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {seconds}s
                </button>
              );
            })
          )}
        </div>

        {/*
          보조기술에는 매초가 아니라 **컷마다 한 번** 알린다. 매초 읽으면 TTS 지연 때문에
          3초 간격에서 "일" 이 셔터 뒤에 읽힌다 — 도움이 아니라 방해다.
        */}
        <p aria-live="polite" className="sr-only">
          {isShooting ? `${shotCount + 1}번째 컷, ${timerSeconds}초 뒤 촬영` : ""}
        </p>

        {/*
          아래 띠. 가운데 자리 하나가 **카메라 켜기 → 촬영 시작 → 셔터**로 바뀐다. 켜고 → 시작하고
          → 찍는 이어지는 한 동작이라 같은 자리여야 한다(apple-design 공간 일관성). 예전에는
          시작 알약이 프리뷰 한가운데 서고 셔터는 아래에서 회색으로 죽어 있어, 시작 동작이
          두 자리에서 경쟁했다.

          촬영 중 셔터는 "기다리지 않고 지금 한 컷"이다(#404). 중단 버튼은 두지 않는다 —
          헤더의 뒤로가기가 그 역할이고(언마운트가 스트림과 진행 중인 인코딩을 정리한다),
          전환은 아이콘만이라 셔터가 항상 정중앙에 온다.
        */}
        <div className="relative flex h-22 shrink-0 items-center justify-center [@media(max-height:700px)]:h-18">
          {canFlipCamera ? (
            <button
              type="button"
              onClick={() => void switchCamera()}
              disabled={isShooting}
              aria-label="카메라 전환"
              title="카메라 전환"
              className="hc-button-icon absolute left-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border disabled:cursor-not-allowed disabled:opacity-45"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          ) : null}

          {isShooting ? (
            <button
              type="button"
              onClick={handleShootNow}
              // 이 버튼이 하는 일은 하나뿐이라 이름도 하나다. 화면에서 글자가 빠져도 보조기술에는 남는다.
              aria-label="바로 촬영"
              // 셔터는 손가락이 닿는 순간 눌려야 한다(apple-design §1). 눌림은 물리 피드백이라 살짝 줄어든다.
              className="grid h-18 w-18 place-items-center rounded-full border-4 border-white transition active:scale-[0.96] [@media(max-height:700px)]:h-15 [@media(max-height:700px)]:w-15"
            >
              <span className="h-13.5 w-13.5 rounded-full bg-(--hc-primary) [@media(max-height:700px)]:h-11 [@media(max-height:700px)]:w-11" />
            </button>
          ) : isCameraReady ? (
            <button
              type="button"
              onClick={startShooting}
              className="hc-button-primary inline-flex h-12 items-center rounded-full px-8 text-[15px] font-extrabold"
            >
              촬영 시작
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={isCheckingCameraPermission}
              className="hc-button-primary inline-flex h-12 items-center rounded-full px-8 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
            >
              카메라 켜기
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
