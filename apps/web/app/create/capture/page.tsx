"use client";

import { useMemo, useSyncExternalStore } from "react";
import { SwitchCamera, Timer } from "lucide-react";
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
    resumeShooting,
    handleShootNow,
    switchCamera,
    canFlipCamera,
    cameraFacingMode,
    MAX_SHOTS,
    TIMER_OPTIONS,
  } = useCaptureFlow();

  const { frameId, shots } = useShootSession();
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

  /*
    카운트다운은 프리뷰 정중앙에 떠 있다(2026-11-15 「타이머는 사진 위에 떠 있어도 되지 않을까, 카메라 정중앙에 방해가
    안 되는 수준으로」). 예전에는 얼굴을 가린다고 프리뷰 밖 아래 띠에 두었다. 가리지 않게 작고 옅게 둔다 — 프리뷰
    짧은 변의 22%(40~96px), 흰색 80%에 옅은 그림자 하나. 밝은 하늘 앞에서도 그림자가 숫자 테두리를 잡아 준다.
    예전 링(96px)처럼 얼굴을 덮지 않고, 화면 전체를 어둡게 덮는 막도 두지 않는다.
  */
  const countSize = stageReady
    ? Math.max(40, Math.min(96, Math.round(Math.min(viewW, viewH) * 0.22)))
    : 56;

  return (
    /*
      촬영 화면은 스크롤하지 않는다. 프리뷰와 셔터가 한 화면에 같이 보여야 하는데,
      390×844 폰에서 셔터가 화면 아래 186px 지점에 있었다(실측). 자기 얼굴을 보면서
      셔터를 누를 수가 없었다. 높이를 뷰포트에 묶고 남는 공간을 프리뷰가 가져간다.

      화면 전체가 뷰파인더다. 예전에는 테두리·패딩이 있는 회색 카드 안에 프리뷰가 떴고,
      세로 4컷은 슬롯이 가로라 카드의 위아래 절반이 "빈 카드"로 읽혔다. 카드를 걷어내고
      검은 면 하나로 두면 남는 공간이 카메라의 어두운 면이 된다 — 카메라 앱이 그렇다.
      테마와 무관하게 어둡다(hc-stage-dark): 밝은 면 위의 프리뷰는 액자처럼 보이고,
      셔터와 숫자가 사진보다 밝아진다.

      자리는 격자 하나가 방향에 따라 바꾼다(2026-11-15 「회전에 따라 옆으로 들면 그거에 맞춰서 넓어질 수도 있어야 해」).
        - 세로: 위에서부터 장수 · 프리뷰 · 간격 칩 · 셔터. 프리뷰는 남는 칸의 **가운데**다(「공간이 남더라도 위에 붙는
          게 아니라 가운데에 있어야 하지 않을까?」 — 예전에는 가로로 긴 칸을 렌즈 가까이 위에 붙였다).
        - 가로: 프리뷰가 왼쪽 전체 높이를 쓰고, 오른쪽 한 줄에 장수(위) · 셔터(가운데) · 간격 칩(아래). 폰을 옆으로
          들면 세로 배치로는 프리뷰가 손바닥만 해진다(844×390 에서 세로 4컷 프리뷰 높이 약 120px). 오른쪽 줄은
          폭을 고정해 카메라를 켜 「카메라 켜기」가 셔터로 바뀌어도 프리뷰 크기가 그대로다.
      앱(WebView)은 지금 세로로 잠겨 있어 가로 배치는 브라우저에서만 보인다(apps/mobile/app.json 의 orientation).
    */
    <main className="hc-stage-dark flex h-dvh flex-col overflow-hidden bg-(--background) px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-(--hc-text) landscape:pl-[max(1rem,env(safe-area-inset-left))] landscape:pr-[max(1rem,env(safe-area-inset-right))]">
      <audio
        ref={shutterAudioRef}
        src="/shutter.mp3"
        preload="auto"
        className="hidden"
      />
      <div className="mx-auto grid min-h-0 w-full max-w-md flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-3 [grid-template-areas:'count'_'stage'_'chips'_'shutter'] landscape:max-w-5xl landscape:grid-cols-[minmax(0,1fr)_10rem] landscape:grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] landscape:gap-x-4 landscape:gap-y-0 landscape:[grid-template-areas:'stage_count'_'stage_.'_'stage_shutter'_'stage_.'_'stage_chips']">
        {/*
          제목과 뒤로가기는 두지 않는다(2026-11-15). 찍기 시작하면 다 찍을 때까지 이 화면이고, 찍기 전에 프레임을
          바꾸려면 기기·브라우저의 뒤로가기로 돌아간다 — 고른 프레임은 /create 이 주소에 적어 두어 그대로 남는다.
          화면 이름은 보조기술에만 둔다.
        */}
        <h1 className="sr-only">사진 촬영</h1>

        {/*
          찍은 장수는 숫자 하나 — 「3/8」(2026-11-15). 필름 카메라의 컷 카운터처럼.

          예전에는 8칸 게이지였다. 몇 장째인지 알려면 칸을 세어야 했고, 폰을 세워 두고 떨어져서 보면 칸이 작아
          셀 수도 없었다. 지금 찍는 칸에 두른 라임 테두리와 빛 번짐은 다른 칸보다 굵은 줄로 보였다. 숫자는
          라임을 쓰지 않는다 — 이 화면의 라임은 셔터 하나다.
        */}
        <p
          role="img"
          aria-label={`${MAX_SHOTS}컷 중 ${shotCount}컷 촬영됨`}
          className="text-center font-mono text-[18px] font-bold tabular-nums [grid-area:count]"
        >
          {shotCount}
          <span className="text-(--hc-muted)">/{MAX_SHOTS}</span>
        </p>

        {/* 카메라 무대 — 프레임 없이, 선택한 프레임 슬롯과 같은 비율의 프리뷰만 보여준다. */}
        <div
          ref={stageRef}
          className="relative flex min-h-0 min-w-0 items-center justify-center [grid-area:stage]"
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
                프리뷰 위에 얹는 것은 셋뿐이다 — 카메라가 꺼져 있을 때의 안내, 카운트다운, 찍힌 순간의 플래시.
                간격 칩과 셔터는 얼굴 위가 아니라 프리뷰 밖에 있다.
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

              {/* 매 초 key 를 바꿔 숫자가 바뀔 때마다 살짝 튀어 오른다(hc-count-tick, 모션을 끈 기기에서는 멈춘다). */}
              {isShooting && countdown != null ? (
                <span
                  key={countdown}
                  aria-hidden
                  className="hc-count-tick pointer-events-none absolute inset-0 z-10 grid place-items-center font-bold leading-none tabular-nums text-white/80 [text-shadow:0_2px_18px_rgba(0,0,0,0.35)]"
                  style={{ fontSize: countSize }}
                >
                  {countdown}
                </span>
              ) : null}

              {/* 찍힌 순간의 플래시. 컷마다 새로 재생하려고 shotCount 로 키를 준다. */}
              {shotCount > 0 ? (
                <span
                  key={shotCount}
                  aria-hidden
                  className="hc-capture-flash pointer-events-none absolute inset-0 z-20 bg-white"
                />
              ) : null}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-(--hc-border) bg-black text-[11px] text-(--hc-muted)">
              프레임을 먼저 선택해 주세요
            </div>
          )}
        </div>

        {/*
          간격 칩(3·5·8초)은 찍는 동안에도 그대로 있다. 숫자가 프리뷰로 올라가 이 자리가 비었고, 찍는 중에 바꾸면 다음
          컷부터 그 간격으로 센다(useCaptureFlow 가 컷마다 timerSeconds 를 다시 읽는다). 가로 배치에서는 오른쪽 줄
          맨 아래라 폭이 좁아 시계 아이콘을 뺀다.
        */}
        <div className="flex h-14 items-center justify-center gap-2 [grid-area:chips] landscape:gap-1.5">
          {TIMER_OPTIONS.map((seconds) => {
            const active = timerSeconds === seconds;
            return (
              <button
                key={seconds}
                type="button"
                onClick={() => setTimerSeconds(seconds)}
                aria-pressed={active}
                aria-label={`${seconds}초 간격`}
                className={`inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-4 text-[13px] font-semibold tabular-nums transition landscape:px-3 ${
                  active
                    ? "bg-(--hc-text) text-(--background)"
                    : "bg-transparent text-(--hc-text) ring-1 ring-(--hc-stage-line)"
                }`}
              >
                <Timer aria-hidden className="h-3.5 w-3.5 landscape:hidden" />
                {seconds}s
              </button>
            );
          })}
        </div>

        {/*
          보조기술에는 매초가 아니라 **컷마다 한 번** 알린다. 매초 읽으면 TTS 지연 때문에
          3초 간격에서 "일" 이 셔터 뒤에 읽힌다 — 도움이 아니라 방해다.
        */}
        <p aria-live="polite" className="sr-only">
          {isShooting ? `${shotCount + 1}번째 컷, ${timerSeconds}초 뒤 촬영` : ""}
        </p>

        {/*
          셔터 자리. 가운데 자리 하나가 **카메라 켜기 → 셔터**로 바뀐다. 켜고 → 찍는 이어지는 한 동작이라
          같은 자리여야 한다(apple-design 공간 일관성).

          카메라가 켜지면 그 자리는 끝까지 **같은 셔터**다(2026-11-09). 예전에는 시작 전에만 「찍기 시작」
          알약이었다가 찍는 동안 셔터로 바뀌었고, 멈추면 그 위에 「찍은 사진 고르기」·「이어서 찍기」,
          가운데에 「처음부터 다시 찍기」가 섰다. 고르기는 다 찍고 넘어간 다음 화면(/create/select)이
          하고, 찍는 동안 처음부터 다시 찍는 길은 두지 않는다. 셔터가 하는 일만 상황에 따라 다르다 —
          시작 · 지금 한 컷(#404) · 멈췄던 데서 이어 찍기. 다 찍은 채로는 이 화면에 머물지 않는다 —
          고르기 화면으로 넘어간다(useCaptureFlow). 다시 찍는 길은 고르기 화면의 「다시 찍기」다.

          중단 버튼은 두지 않는다 — 찍기 시작하면 다 찍을 때까지다. 기기·브라우저의 뒤로가기로 떠나면 언마운트가
          스트림과 진행 중인 인코딩을 정리한다. 카메라 전환도 찍기 전에만 둔다(2026-11-15) — 찍는 동안에는
          잠가 둔 단추였을 뿐이다. 전환은 아이콘만이고 따로 떠 있어서, 있든 없든 셔터는 제자리다 — 세로에서는
          셔터 왼쪽, 가로에서는 셔터 아래 빈자리.
        */}
        <div className="relative flex h-22 items-center justify-center [grid-area:shutter] [@media(max-height:700px)]:h-18">
          {canFlipCamera && !isShooting && shots.length === 0 ? (
            <button
              type="button"
              onClick={() => void switchCamera()}
              aria-label="카메라 전환"
              title="카메라 전환"
              className="hc-button-icon absolute left-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border landscape:left-1/2 landscape:top-full landscape:mt-4 landscape:-translate-x-1/2 landscape:translate-y-0"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
          ) : null}

          {isShooting || isCameraReady ? (
            <button
              type="button"
              onClick={isShooting ? handleShootNow : shots.length === 0 ? () => startShooting() : resumeShooting}
              // 모양은 하나지만 하는 일은 상황마다 다르다. 화면에 글자가 없으니 보조기술에는 그 일을 말한다.
              aria-label={isShooting ? "바로 찍기" : shots.length === 0 ? "찍기 시작" : "이어서 찍기"}
              // 셔터는 손가락이 닿는 순간 눌려야 한다(apple-design §1). 눌림은 물리 피드백이라 살짝 줄어든다.
              className="grid h-18 w-18 place-items-center rounded-full border-4 border-(--hc-text) transition active:scale-[0.96] [@media(max-height:700px)]:h-15 [@media(max-height:700px)]:w-15"
            >
              <span className="h-13.5 w-13.5 rounded-full bg-(--hc-primary) [@media(max-height:700px)]:h-11 [@media(max-height:700px)]:w-11" />
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
