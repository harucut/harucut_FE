"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { nativeHaptic } from "@/lib/nativeBridge";
import { useShootSession } from "@/lib/shootSessionStore";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { centerCrop, cropPhotoToPreviewThenSlot } from "@/lib/canvas/captureCrop";
import { prepareStillCapture, takeStillBitmap } from "@/lib/canvas/stillCapture";

// 촬영 총 장수
const MAX_SHOTS = 8;
// 선택 가능한 타이머 간격(초)
export const TIMER_OPTIONS = [3, 5, 8] as const;
export type TimerSeconds = (typeof TIMER_OPTIONS)[number];

type ShootingState = {
  isShooting: boolean;
  countdown: number | null;
};

type CameraFacingMode = "user" | "environment";

export function useCaptureFlow() {
  const router = useRouter();
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  const { frameId, addShotPhoto, resetShots } = useShootSession();

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCheckingCameraPermission, setIsCheckingCameraPermission] =
    useState(true);
  const [shooting, setShooting] = useState<ShootingState>({
    isShooting: false,
    countdown: null,
  });
  const [shotCount, setShotCount] = useState(0);
  const [cameraFacingMode, setCameraFacingMode] =
    useState<CameraFacingMode>("user");
  // 타이머 간격은 "촬영 시작 전에만" 고를 수 있다(촬영 중에는 칩이 사라진다).
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * 스틸 촬영기. 이 기기에서 스틸이 영상보다 이득일 때만 채워진다(lib/canvas/stillCapture.ts).
   * null 이면 예전처럼 영상 프레임을 긁는다.
   */
  const stillCaptureRef = useRef<Awaited<
    ReturnType<typeof prepareStillCapture>
  > | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoStartAttemptedRef = useRef(false);

  // 타이머와 즉시 촬영 버튼이 같은 샷을 중복 처리하지 않도록 마지막으로 끝낸 샷 인덱스를 기록
  const lastFinishedShotRef = useRef(-1);
  // shooting.isShooting의 동기 미러. 상태는 비동기라, 첫 셔터 더블탭처럼 리렌더 이전의
  // stale 클로저가 세션을 두 번 시작/리셋해 첫 장을 날리는 것을 막는 가드로 쓴다.
  const isShootingRef = useRef(false);
  /**
   * 촬영 회차 번호.
   *
   * 한 컷의 인코딩(toBlob → FileReader)은 비동기라, 그 사이에 화면을 떠나면(헤더의 뒤로 가기)
   * 언마운트 뒤에 결과가 돌아온다. 그대로 두면 떠난 세션에 사진이 얹히고, 마지막 컷을
   * 인코딩하던 중이었다면 떠난 화면에서 /shoot/select 로 다시 밀어 넣는다.
   * 시작·언마운트 때마다 번호를 올리고, 인코딩 전후로 번호가 같은지 본다.
   */
  const shootGenerationRef = useRef(0);

  const canFlipCamera =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const captureSlot = useMemo(() => {
    if (!frameId) return null;
    const layout = FRAME_LAYOUTS[frameId];
    if (!layout || layout.slots.length === 0) return null;
    return layout.slots[shotCount % layout.slots.length];
  }, [frameId, shotCount]);

  /**
   * 카메라에 세로 스트림을 요청할지.
   *
   * **한 컷씩 바뀌는 `captureSlot` 이 아니라 프레임 기준으로 잡는다.** 한 레이아웃 안의
   * 슬롯 넷은 치수가 모두 같아서 방향도 같은데, 매 컷 새로 만들어지는 captureSlot 을
   * startCamera 의 의존성에 넣으면 촬영할 때마다 startCamera 의 정체가 바뀌고
   * 자동 시작 effect 가 매번 다시 돈다. 값은 같은데 재구독만 하는 셈이다.
   */
  const wantsPortraitCapture = useMemo(() => {
    if (!frameId) return true;
    const slot = FRAME_LAYOUTS[frameId]?.slots[0];
    return slot ? slot.height > slot.width : true;
  }, [frameId]);

  /** 슬롯 가로세로비. 위와 같은 이유로 프레임 기준이라 촬영 중에 바뀌지 않는다. */
  const captureSlotAspect = useMemo(() => {
    if (!frameId) return 1;
    const slot = FRAME_LAYOUTS[frameId]?.slots[0];
    return slot ? slot.width / slot.height : 1;
  }, [frameId]);

  // 프레임 없이 들어오면 되돌리기
  useEffect(() => {
    if (!frameId) router.replace("/shoot");
  }, [frameId, router]);

  // 촬영 화면에 들어올 때마다 이전(완료·중단) 세션의 촬영본을 비운다.
  // 모바일 shoot-screens와 같은 규약: 프레임은 유지하고 shots만 초기화한다.
  // 이게 없으면 '다시 촬영'으로 돌아왔을 때 배지는 0/8인데 스토어에는 8장이 남아 있고,
  // '촬영 시작'이 그 8장을 확인 없이 지워 버린다.
  // shotCount·lastFinishedShotRef는 마운트마다 새로 시작하므로 여기서 건드릴 필요가 없다.
  useEffect(() => {
    resetShots();
  }, [resetShots]);

  // 카메라 스트림 종료 및 상태 초기화
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // 트랙이 죽으면 촬영기도 못 쓴다. 다음 startCamera 에서 다시 만든다.
    stillCaptureRef.current = null;
    setIsCameraReady(false);
  }, []);

  // 카메라 권한 요청 및 스트림 시작
  const startCamera = useCallback(async (nextFacingMode?: CameraFacingMode) => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "CAMERA ACCESS",
          icon: "camera",
          message:
            "현재 브라우저에서는 카메라를 쓸 수 없어요. 최신 브라우저에서 다시 시도해 주세요.",
          title: "카메라를 사용할 수 없어요",
        });
        return;
      }

      stopStream();

      const facingMode = nextFacingMode ?? cameraFacingMode;

      /*
        해상도는 **슬롯이 요구하는 만큼** 달라고 한다.

        예전에는 방향과 무관하게 늘 가로 1920x1080 을 요청했다. 그런데 촬영본은 슬롯 비율로
        가운데를 잘라 쓰고(capturePhotoToDataUrl), 그 조각을 슬롯 크기로 다시 늘린다
        (lib/fourcutCompose.ts renderSourceForSlot). 그래서 **네 레이아웃 모두 확대**됐다:

          classic  슬롯 1700x1200 ← 캡처 1530x1080   1.11배 확대
          wide     슬롯 2400x1700 ← 캡처 1525x1080   1.57배 확대
          grid     슬롯 1700x2400 ← 캡처  765x1080   2.22배 확대  ← 세로 슬롯에 가로 스트림
          polaroid 슬롯 1700x2400 ← 캡처  765x1080   2.22배 확대

        세로 슬롯이 가장 심하다. 가로 스트림에서 세로 조각을 떼면 폭이 통째로 날아간다.
        그래서 슬롯이 세로면 세로 스트림을 요청한다. 4K 를 받으면 네 경우 모두 확대가
        사라지거나(다운스케일) 1.11배까지 줄어든다.

        `ideal` 이라 지원하지 않는 기기에서는 브라우저가 가장 가까운 값으로 낮춰 준다 —
        요청이 실패하지는 않는다.
      */
      const longEdge = 3840;
      const shortEdge = 2160;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: wantsPortraitCapture ? shortEdge : longEdge },
          height: { ideal: wantsPortraitCapture ? longEdge : shortEdge },
        },
        audio: false,
      });

      streamRef.current = stream;

      /*
        스틸 촬영을 쓸 수 있는지 **여기서 한 번만** 재 본다.
        매 컷 재면 그만큼 셔터가 늦어지고, 기기 성능은 촬영 중에 바뀌지 않는다.
        이득이 없거나 지원하지 않으면 null 이라 아래 촬영이 예전 경로로 간다.
      */
      const track = stream.getVideoTracks()[0];
      if (track) {
        stillCaptureRef.current = await prepareStillCapture(
          track,
          captureSlotAspect,
        );
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setIsCameraReady(true);
      setCameraFacingMode(facingMode);
    } catch (err) {
      console.error(err);
      setNotice({
        actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
        eyebrow: "CAMERA ACCESS",
        icon: "camera",
        message:
          "카메라 접근이 거부됐거나 오류가 났어요. 브라우저 권한을 확인한 뒤 다시 시도해 주세요.",
        title: "카메라 접근이 필요해요",
      });
    }
  }, [cameraFacingMode, wantsPortraitCapture, captureSlotAspect, setNotice, stopStream]);

  useEffect(() => {
    if (!frameId || isCameraReady || autoStartAttemptedRef.current) {
      setIsCheckingCameraPermission(false);
      return;
    }

    let cancelled = false;

    const startIfCameraAlreadyAllowed = async () => {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        if (!cancelled) setIsCheckingCameraPermission(false);
        return;
      }

      try {
        const permission = await navigator.permissions.query({
          name: "camera" as PermissionName,
        });

        if (!cancelled && permission.state === "granted") {
          autoStartAttemptedRef.current = true;
          await startCamera();
        }
      } catch {
        // 권한 API가 카메라 조회를 지원하지 않는 브라우저에서는 수동 버튼 흐름 유지
      } finally {
        if (!cancelled) setIsCheckingCameraPermission(false);
      }
    };

    void startIfCameraAlreadyAllowed();

    return () => {
      cancelled = true;
    };
  }, [frameId, isCameraReady, startCamera]);

  // 언마운트 시 정리. 촬영을 멈추는 길은 이것 하나다 — 화면에 중단 버튼은 없고 헤더의 뒤로 가기가
  // 그 역할이라, 스트림을 닫고 진행 중인 인코딩의 결과를 무효로 만든다(shootGenerationRef 주석).
  useEffect(() => {
    return () => {
      stopStream();
      shootGenerationRef.current += 1;
    };
  }, [stopStream]);

  const playShutterSound = useCallback(() => {
    const audio = shutterAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  // 현재 프레임을 캡처. 전면(user) 카메라만 셀피 감각을 위해 좌우반전하고,
  // 후면(environment) 카메라는 반전하지 않는다(간판·텍스트가 뒤집혀 저장되던 버그 수정).
  const capturePhotoToDataUrl = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const videoWidth = video.videoWidth || 480;
    const videoHeight = video.videoHeight || 640;

    const targetWidth = captureSlot?.width ?? videoWidth;
    const targetHeight = captureSlot?.height ?? videoHeight;
    const targetAspect = targetWidth / targetHeight;

    // 셔터음은 그림을 만들기 전에 낸다 — 누른 순간과 소리가 붙어 있어야 한다.
    // 스틸 촬영은 수백 ms 가 걸릴 수 있어서 이 순서가 더 중요해졌다.
    playShutterSound();
    // 소리와 같은 프레임에 진동(apple-design: 시각·소리·촉각은 한 순간에). 셸 밖에서는 아무 일도 없다.
    nativeHaptic("medium");

    /*
      가능하면 **사진 파이프라인**으로 찍는다(ImageCapture.takePhoto).
      영상 프레임보다 크고, 카메라 앱이 쓰는 처리를 그대로 탄다.

      스틸은 프리뷰와 화각이 다를 수 있어서(4:3 사진 vs 16:9 영상) 슬롯 비율로 곧장 자르면
      화면에서 본 적 없는 부분이 결과물에 들어온다. 그래서 프리뷰 화각으로 먼저 맞춘 뒤
      슬롯 비율로 자른다(lib/canvas/captureCrop.ts).

      실패하면 null 이라 그대로 영상 프레임 경로로 내려간다 — 촬영이 실패하지는 않는다.
    */
    let source: CanvasImageSource = video;
    let crop = centerCrop(videoWidth, videoHeight, targetAspect);

    const stillCapture = stillCaptureRef.current;
    if (stillCapture) {
      const bitmap = await takeStillBitmap(stillCapture);
      if (bitmap) {
        source = bitmap;
        crop = cropPhotoToPreviewThenSlot({
          photoWidth: bitmap.width,
          photoHeight: bitmap.height,
          previewAspect: videoWidth / videoHeight,
          slotAspect: targetAspect,
        });
      }
    }

    const { sx, sy, sw, sh } = crop;

    /*
      자른 좌표(sx·sy·sw·sh)는 그대로 두고 **담는 그릇만** 슬롯 크기까지 줄인다.
      화각은 위에서 이미 정했다 — 여기서 바꾸면 화면에서 본 것과 결과물이 달라진다.

      4K 요청과 스틸 촬영을 붙인 뒤로 잘라낸 조각이 6~9MP 까지 나온다. 그 크기 그대로
      담으면 둘이 걸린다.
        - 8장을 data URL 로 세션에 들고 있어야 해서 모바일 메모리와 인코딩 비용이 그만큼 커진다.
        - 비회원이 고른 4장은 localStorage 로 인계되는데(lib/pendingGuestSave.ts), 한도(대개
          5MB)를 넘겨 setPendingGuestSave 가 실패한다. 그러면 로그인 뒤 기록 저장 흐름이
          통째로 사라진다.
      어차피 합성 단계가 슬롯 크기 캔버스에 그리므로(lib/fourcutCompose.ts renderSourceForSlot)
      슬롯을 넘는 화소는 거기서 버려진다. 여기서 미리 버려도 결과물은 같다.

      **슬롯보다 작게는 절대 줄이지 않는다**(`Math.min(1, ...)`). 이 PR 이 해상도를 올린 이유가
      합성 단계의 확대를 없애는 것이었고, 상한을 슬롯 아래로 잡으면 그 확대가 그대로 돌아온다.
      상한은 FRAME_LAYOUTS 에서 온 슬롯 치수(targetWidth·targetHeight)라 레이아웃이 늘거나
      커져도 따라온다 — 숫자를 다시 박지 않는다. lib/photoImport.ts 도 불러온 사진에
      같은 규칙을 쓴다.

      가로·세로 비율을 모두 재는 건 반올림 오차 대비다. crop 은 targetAspect 로 잘려 나와
      두 비가 같아야 하지만, 작은 쪽을 골라 두면 어느 쪽도 슬롯을 넘지 않는다.
      프레임이 없어 captureSlot 이 null 이면 target 이 영상 크기라 배율이 1 이다 — 예전 동작.
    */
    const outputScale = Math.min(1, targetWidth / sw, targetHeight / sh);

    canvas.width = Math.max(1, Math.round(sw * outputScale));
    canvas.height = Math.max(1, Math.round(sh * outputScale));

    ctx.save();
    if (cameraFacingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // 비트맵은 GPU 메모리를 잡는다. 8 연사면 금세 쌓이므로 그린 뒤 바로 놓아준다.
    if (source !== video && "close" in source) source.close();

    // toDataURL 은 메인 스레드에서 동기로 JPEG 을 인코딩한다. 촬영 한 장에 100ms 대가
    // 통째로 멈춰서, 8 연사 동안 카운트다운과 프리뷰가 눈에 띄게 끊겼다.
    // toBlob 은 인코딩을 브라우저에 맡기고 콜백으로 돌려주므로 그 구간이 사라진다.
    return await new Promise<string | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.92,
      );
    });
  }, [playShutterSound, captureSlot, cameraFacingMode]);

  // 1샷 종료 처리(사진 추가 + 다음 카운트/종료)
  // state updater 안에서 호출하지 않는다 — 라우팅 같은 사이드 이펙트가 함께 실행되므로
  const finishSingleShot = useCallback(async () => {
    // 카운트다운 타이머와 즉시 촬영 클릭이 같은 샷에 동시에 도달해도 한 번만 처리.
    // 인코딩을 기다리는 동안에도 다른 트리거가 끼어들 수 있으므로 await 전에 선점한다.
    if (lastFinishedShotRef.current >= shotCount) return;
    lastFinishedShotRef.current = shotCount;

    const generation = shootGenerationRef.current;
    const photoDataUrl = await capturePhotoToDataUrl();

    // 인코딩 중에 화면을 떠났으면 결과를 버린다. 선점도 되돌리지 않는다 — 떠난 화면이다.
    if (shootGenerationRef.current !== generation) return;

    if (!photoDataUrl) {
      // 인코딩이 실패했으면 이 컷은 아직 안 찍힌 것이다. 선점을 되돌려 다시 시도할 수 있게 한다.
      lastFinishedShotRef.current = shotCount - 1;
      return;
    }

    addShotPhoto(photoDataUrl);

    const next = shotCount + 1;
    setShotCount(next);

    if (next < MAX_SHOTS) {
      // 다음 컷까지 선택한 간격으로 자동 카운트다운.
      setShooting((s) => ({ ...s, countdown: timerSeconds }));
      return;
    }

    isShootingRef.current = false;
    setShooting({ isShooting: false, countdown: null });
    router.push("/shoot/select");
  }, [shotCount, capturePhotoToDataUrl, addShotPhoto, timerSeconds, router]);

  // 전체 자동 촬영 시작
  const startShooting = useCallback(() => {
    if (!isCameraReady) {
      setNotice({
        actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
        eyebrow: "CAMERA READY",
        icon: "camera",
        message: "촬영을 시작하기 전에 먼저 카메라를 켜 주세요.",
        title: "카메라 준비가 필요해요",
      });
      return;
    }

    // 이미 촬영 중이면 재시작 무시(시작 버튼 더블탭으로 중복 시작되는 것 방지).
    if (isShootingRef.current) return;

    resetShots();
    setShotCount(0);
    lastFinishedShotRef.current = -1;
    isShootingRef.current = true;
    shootGenerationRef.current += 1;

    // 선택한 간격으로 카운트다운을 돌려 8장을 자동 연속 촬영.
    setShooting({ isShooting: true, countdown: timerSeconds });
  }, [isCameraReady, resetShots, setNotice, timerSeconds]);

  // 카운트다운 타이머
  useEffect(() => {
    if (!shooting.isShooting) return;
    if (shooting.countdown === null) return;

    const timer = window.setTimeout(() => {
      // 이 effect는 isShooting/countdown 변경마다 재실행되므로 closure 값이 최신
      if (shooting.countdown !== null && shooting.countdown <= 1) {
        void finishSingleShot();
        return;
      }

      setShooting((prev) => {
        if (!prev.isShooting || prev.countdown === null) return prev;
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [shooting.isShooting, shooting.countdown, finishSingleShot]);

  const handleShootNow = useCallback(() => {
    if (!shooting.isShooting || !isCameraReady) return;
    void finishSingleShot();
  }, [shooting.isShooting, isCameraReady, finishSingleShot]);

  const switchCamera = useCallback(async () => {
    if (!canFlipCamera) return;
    const nextFacingMode =
      cameraFacingMode === "user" ? "environment" : "user";
    await startCamera(nextFacingMode);
  }, [cameraFacingMode, canFlipCamera, startCamera]);

  return {
    videoRef,
    canvasRef,
    shutterAudioRef,

    isCameraReady,
    isCheckingCameraPermission,
    isShooting: shooting.isShooting,
    countdown: shooting.countdown,
    shotCount,
    cameraFacingMode,
    canFlipCamera,

    timerSeconds,
    setTimerSeconds,

    startCamera,
    startShooting,
    handleShootNow,
    switchCamera,

    MAX_SHOTS,
    TIMER_OPTIONS,
  };
}
