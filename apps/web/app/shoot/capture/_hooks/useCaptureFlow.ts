"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import { getBestWebmMimeType } from "@/lib/capture/mediaRecorder";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

// 촬영 총 장수
const MAX_SHOTS = 8;
// 샷 간 간격(초)
const MAX_COUNT = 8;

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoStartAttemptedRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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

  // 샷마다 짧은 동영상 기록 시작
  const startRecordingForShot = useCallback(() => {
    if (!streamRef.current || typeof MediaRecorder === "undefined") return;

    const mimeType = getBestWebmMimeType();
    if (!mimeType) return;

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
    }
  }, [attachVideoToShot]);

  // 1샷 종료 처리(사진 추가 + 다음 카운트/종료)
  const finishSingleShot = useCallback(() => {
    const photoDataUrl = capturePhotoToDataUrl();
    if (!photoDataUrl) return;

    addShotPhoto(photoDataUrl);

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") mr.stop();

    setShotCount((prev) => {
      const next = prev + 1;

      // 다음 샷이면: 녹화 재시작 + 카운트 리셋
      if (next < MAX_SHOTS) {
        startRecordingForShot();
        setShooting((s) => ({ ...s, countdown: MAX_COUNT }));
        return next;
      }

      // 마지막 샷이면: 촬영 종료 + 이동 (라우팅은 다음 틱)
      setShooting({ isShooting: false, countdown: null });
      setTimeout(() => {
        router.push("/shoot/select");
      }, 0);

      return next;
    });
  }, [capturePhotoToDataUrl, addShotPhoto, startRecordingForShot, router]);

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

    setShooting({ isShooting: true, countdown: MAX_COUNT });

    startRecordingForShot();
  }, [isCameraReady, resetShots, setNotice, startRecordingForShot]);

  // 카운트다운 타이머
  useEffect(() => {
    if (!shooting.isShooting) return;
    if (shooting.countdown === null) return;

    const timer = window.setTimeout(() => {
      // 여기서는 callback이므로 setState ok
      setShooting((prev) => {
        // 타입 경고 방지: prev.countdown은 null일 수 있음 → 가드
        if (!prev.isShooting || prev.countdown === null) return prev;

        if (prev.countdown <= 1) {
          // countdown state는 finishSingleShot에서 다시 세팅되거나 종료됨
          // 여기서는 null로 만들지 말고 그냥 유지(중복 렌더 방지)
          finishSingleShot();
          return prev;
        }

        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [shooting.isShooting, shooting.countdown, finishSingleShot]);

  const handleShootNow = useCallback(() => {
    if (!shooting.isShooting || !isCameraReady) return;
    finishSingleShot();
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
    remainingShots,
    cameraFacingMode,
    canFlipCamera,

    startCamera,
    startShooting,
    handleShootNow,
    switchCamera,

    MAX_SHOTS,
    MAX_COUNT,
  };
}
