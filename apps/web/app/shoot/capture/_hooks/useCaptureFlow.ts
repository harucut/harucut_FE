"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

// 촬영 총 장수
const MAX_SHOTS = 8;
// 선택 가능한 타이머 간격(초)
export const TIMER_OPTIONS = [3, 5, 8] as const;
export type TimerSeconds = (typeof TIMER_OPTIONS)[number];
// 촬영 모드: 타이머(시작 전 간격 선택 → 8장 자동 연속) / 수동(셔터 1장씩)
export type CaptureMode = "timer" | "manual";

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
  // 촬영 모드와 타이머 간격은 "촬영 시작 전에만" 변경 가능(시작 후 잠금)
  // 기본은 수동 촬영. 타이머 모드는 사용자가 직접 선택할 수 있다.
  const [captureMode, setCaptureMode] = useState<CaptureMode>("manual");
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoStartAttemptedRef = useRef(false);

  // 타이머와 즉시 촬영 버튼이 같은 샷을 중복 처리하지 않도록 마지막으로 끝낸 샷 인덱스를 기록
  const lastFinishedShotRef = useRef(-1);
  // shooting.isShooting의 동기 미러. 상태는 비동기라, 첫 셔터 더블탭처럼 리렌더 이전의
  // stale 클로저가 세션을 두 번 시작/리셋해 첫 장을 날리는 것을 막는 가드로 쓴다.
  const isShootingRef = useRef(false);

  const remainingShots = Math.max(0, MAX_SHOTS - shotCount);
  const canFlipCamera =
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const captureSlot = useMemo(() => {
    if (!frameId) return null;
    const layout = FRAME_LAYOUTS[frameId];
    if (!layout || layout.slots.length === 0) return null;
    return layout.slots[shotCount % layout.slots.length];
  }, [frameId, shotCount]);

  // 프레임 없이 들어오면 되돌리기
  useEffect(() => {
    if (!frameId) router.replace("/shoot");
  }, [frameId, router]);

  // 카메라 스트림 종료 및 상태 초기화
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
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
            "현재 브라우저에서는 카메라를 지원하지 않습니다. 최신 브라우저에서 다시 시도해 주세요.",
          title: "카메라를 사용할 수 없어요",
        });
        return;
      }

      stopStream();

      const facingMode = nextFacingMode ?? cameraFacingMode;

      const stream = await navigator.mediaDevices.getUserMedia({
        // ideal 해상도를 요청해 기본 640x480 저해상도 스트림으로 떨어지지 않게 한다
        // (인화·저장용 결과물 품질 확보). 지원 안 되면 브라우저가 근접 값으로 대체.
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

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
          "카메라 접근이 거부되었거나 오류가 발생했습니다. 브라우저 권한을 확인한 뒤 다시 시도해 주세요.",
        title: "카메라 접근이 필요해요",
      });
    }
  }, [cameraFacingMode, setNotice, stopStream]);

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

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      stopStream();
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
  const capturePhotoToDataUrl = useCallback(() => {
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
    const videoAspect = videoWidth / videoHeight;

    let sx = 0;
    let sy = 0;
    let sw = videoWidth;
    let sh = videoHeight;

    if (videoAspect > targetAspect) {
      sw = videoHeight * targetAspect;
      sx = (videoWidth - sw) / 2;
    } else if (videoAspect < targetAspect) {
      sh = videoWidth / targetAspect;
      sy = (videoHeight - sh) / 2;
    }

    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));

    ctx.save();
    if (cameraFacingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    playShutterSound();
    return dataUrl;
  }, [playShutterSound, captureSlot, cameraFacingMode]);

  // 1샷 종료 처리(사진 추가 + 다음 카운트/종료)
  // state updater 안에서 호출하지 않는다 — 라우팅 같은 사이드 이펙트가 함께 실행되므로
  const finishSingleShot = useCallback(() => {
    // 카운트다운 타이머와 즉시 촬영 클릭이 같은 샷에 동시에 도달해도 한 번만 처리
    if (lastFinishedShotRef.current >= shotCount) return;

    const photoDataUrl = capturePhotoToDataUrl();
    if (!photoDataUrl) return;

    lastFinishedShotRef.current = shotCount;
    addShotPhoto(photoDataUrl);

    const next = shotCount + 1;
    setShotCount(next);

    if (next < MAX_SHOTS) {
      // 타이머 모드: 다음 컷까지 선택한 간격으로 자동 카운트다운.
      // 수동 모드: 카운트다운 없이 다음 셔터를 기다린다.
      setShooting((s) => ({
        ...s,
        countdown: captureMode === "timer" ? timerSeconds : null,
      }));
      return;
    }

    isShootingRef.current = false;
    setShooting({ isShooting: false, countdown: null });
    router.push("/shoot/select");
  }, [
    shotCount,
    capturePhotoToDataUrl,
    addShotPhoto,
    captureMode,
    timerSeconds,
    router,
  ]);

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

    // 타이머 모드: 선택한 간격으로 카운트다운을 돌려 8장을 자동 연속 촬영.
    // 수동 모드: 카운트다운 없이 첫 컷을 바로 찍고, 이후 셔터를 누를 때마다 1장씩.
    if (captureMode === "timer") {
      setShooting({ isShooting: true, countdown: timerSeconds });
      return;
    }

    setShooting({ isShooting: true, countdown: null });
    // 첫 수동 컷은 사용자가 셔터를 누를 때 찍힌다.
  }, [
    isCameraReady,
    resetShots,
    setNotice,
    captureMode,
    timerSeconds,
  ]);

  // 카운트다운 타이머
  useEffect(() => {
    if (!shooting.isShooting) return;
    if (shooting.countdown === null) return;

    const timer = window.setTimeout(() => {
      // 이 effect는 isShooting/countdown 변경마다 재실행되므로 closure 값이 최신
      if (shooting.countdown !== null && shooting.countdown <= 1) {
        finishSingleShot();
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
    finishSingleShot();
  }, [shooting.isShooting, isCameraReady, finishSingleShot]);

  // 수동 모드 셔터: 한 번 누를 때마다 즉시 1장.
  // 첫 셔터에서 세션을 리셋하고 바로 한 장 찍어, "누르면 즉시 촬영" 사양을 만족한다.
  const handleManualShutter = useCallback(() => {
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

    if (!isShootingRef.current) {
      // 첫 컷: 세션 초기화 후 같은 클릭에서 바로 1장 촬영.
      // 동기 ref로 가드해, 리렌더 전 더블탭이 세션을 두 번 리셋(첫 장 유실)하지 않게 한다.
      isShootingRef.current = true;
      resetShots();
      setShotCount(0);
      lastFinishedShotRef.current = -1;
      setShooting({ isShooting: true, countdown: null });
    }

    finishSingleShot();
  }, [
    isCameraReady,
    resetShots,
    setNotice,
    finishSingleShot,
  ]);

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
    remainingShots,
    cameraFacingMode,
    canFlipCamera,

    captureMode,
    setCaptureMode,
    timerSeconds,
    setTimerSeconds,

    startCamera,
    startShooting,
    handleShootNow,
    handleManualShutter,
    switchCamera,

    MAX_SHOTS,
    TIMER_OPTIONS,
  };
}
