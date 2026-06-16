"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import { getBestWebmMimeType } from "@/lib/capture/mediaRecorder";
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
  const { frameId, addShotPhoto, attachVideoToShot, resetShots } =
    useShootSession();

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
  const [captureMode, setCaptureMode] = useState<CaptureMode>("timer");
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(3);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoStartAttemptedRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  // 타이머와 즉시 촬영 버튼이 같은 샷을 중복 처리하지 않도록 마지막으로 끝낸 샷 인덱스를 기록
  const lastFinishedShotRef = useRef(-1);
  const recordingNoticeShownRef = useRef(false);

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
        video: { facingMode },
        audio: true,
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
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      stopStream();
    };
  }, [stopStream]);

  const playShutterSound = useCallback(() => {
    const audio = shutterAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, []);

  // 현재 프레임을 좌우반전해서 캡처
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
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    playShutterSound();
    return dataUrl;
  }, [playShutterSound, captureSlot]);

  // 녹화 불가 환경은 한 번만 안내하고 사진 전용으로 계속 진행
  const notifyRecordingUnavailable = useCallback(() => {
    if (recordingNoticeShownRef.current) return;
    recordingNoticeShownRef.current = true;
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: "VIDEO RECORDING",
      icon: "camera",
      message:
        "현재 브라우저에서 영상 녹화를 사용할 수 없어 사진만 저장됩니다. 촬영은 계속 진행돼요.",
      title: "영상 없이 촬영을 진행해요",
    });
  }, [setNotice]);

  // 샷마다 짧은 동영상 기록 시작
  const startRecordingForShot = useCallback(() => {
    if (!streamRef.current || typeof MediaRecorder === "undefined") {
      notifyRecordingUnavailable();
      return;
    }

    const mimeType = getBestWebmMimeType();
    if (!mimeType) {
      notifyRecordingUnavailable();
      return;
    }

    try {
      recordedChunksRef.current = [];

      const mr = new MediaRecorder(streamRef.current, { mimeType });

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        if (!recordedChunksRef.current.length) return;

        const blob = new Blob(recordedChunksRef.current, {
          type: "video/webm",
        });
        const videoUrl = URL.createObjectURL(blob);
        attachVideoToShot(videoUrl);
        recordedChunksRef.current = [];
      };

      mediaRecorderRef.current = mr;
      mr.start();
    } catch (err) {
      console.error("MediaRecorder start error:", err);
      notifyRecordingUnavailable();
    }
  }, [attachVideoToShot, notifyRecordingUnavailable]);

  // 1샷 종료 처리(사진 추가 + 다음 카운트/종료)
  // state updater 안에서 호출하지 않는다 — 녹화 재시작/라우팅 같은 사이드 이펙트가 함께 실행되므로
  const finishSingleShot = useCallback(() => {
    // 카운트다운 타이머와 즉시 촬영 클릭이 같은 샷에 동시에 도달해도 한 번만 처리
    if (lastFinishedShotRef.current >= shotCount) return;

    const photoDataUrl = capturePhotoToDataUrl();
    if (!photoDataUrl) return;

    lastFinishedShotRef.current = shotCount;
    addShotPhoto(photoDataUrl);

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();

    const next = shotCount + 1;
    setShotCount(next);

    if (next < MAX_SHOTS) {
      startRecordingForShot();
      // 타이머 모드: 다음 컷까지 선택한 간격으로 자동 카운트다운.
      // 수동 모드: 카운트다운 없이 다음 셔터를 기다린다(녹화만 미리 시작).
      setShooting((s) => ({
        ...s,
        countdown: captureMode === "timer" ? timerSeconds : null,
      }));
      return;
    }

    setShooting({ isShooting: false, countdown: null });
    router.push("/shoot/select");
  }, [
    shotCount,
    capturePhotoToDataUrl,
    addShotPhoto,
    startRecordingForShot,
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

    resetShots();
    setShotCount(0);
    lastFinishedShotRef.current = -1;

    // 타이머 모드: 선택한 간격으로 카운트다운을 돌려 8장을 자동 연속 촬영.
    // 수동 모드: 카운트다운 없이 첫 컷을 바로 찍고, 이후 셔터를 누를 때마다 1장씩.
    if (captureMode === "timer") {
      setShooting({ isShooting: true, countdown: timerSeconds });
      startRecordingForShot();
      return;
    }

    setShooting({ isShooting: true, countdown: null });
    startRecordingForShot();
    // 첫 수동 컷은 사용자가 셔터를 누를 때 찍히므로 여기서는 녹화만 준비한다.
  }, [
    isCameraReady,
    resetShots,
    setNotice,
    startRecordingForShot,
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
  // 첫 셔터에서 세션을 시작(리셋+녹화)하고 바로 한 장 찍어, "누르면 즉시 촬영" 사양을 만족한다.
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

    if (!shooting.isShooting) {
      // 첫 컷: 세션 초기화 후 녹화 시작 → 같은 클릭에서 바로 1장 촬영
      resetShots();
      setShotCount(0);
      lastFinishedShotRef.current = -1;
      setShooting({ isShooting: true, countdown: null });
      startRecordingForShot();
    }

    finishSingleShot();
  }, [
    isCameraReady,
    shooting.isShooting,
    resetShots,
    setNotice,
    startRecordingForShot,
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
