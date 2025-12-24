"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { getBestWebmMimeType } from "@/lib/capture/mediaRecorder";

const MAX_SHOTS = 8;
const MAX_COUNT = 8;

type ShootingState = {
  isShooting: boolean;
  countdown: number | null;
};

export function useCaptureFlow() {
  const router = useRouter();
  const { frameId, addShotPhoto, attachVideoToShot, resetShots } =
    useShootSession();

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [shooting, setShooting] = useState<ShootingState>({
    isShooting: false,
    countdown: null,
  });
  const [shotCount, setShotCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const remainingShots = Math.max(0, MAX_SHOTS - shotCount);

  // 프레임 없이 들어오면 되돌리기
  useEffect(() => {
    if (!frameId) router.replace("/shoot");
  }, [frameId, router]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("이 브라우저에서는 카메라 사용을 지원하지 않아요.");
        return;
      }

      stopStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setIsCameraReady(true);
    } catch (err) {
      console.error(err);
      alert("카메라 접근이 거부되었거나 오류가 발생했어요.");
    }
  }, [stopStream]);

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

  const capturePhotoToDataUrl = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const width = video.videoWidth || 480;
    const height = video.videoHeight || 640;

    canvas.width = width;
    canvas.height = height;

    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    playShutterSound();
    return dataUrl;
  }, [playShutterSound]);

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

  // 한 샷 완료 처리: 여기서 다음 단계(다음 샷/종료/라우팅)까지 전부 처리
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

  const startShooting = useCallback(() => {
    if (!isCameraReady) {
      alert("먼저 카메라를 켜주세요.");
      return;
    }

    resetShots();
    setShotCount(0);

    setShooting({ isShooting: true, countdown: MAX_COUNT });

    startRecordingForShot();
  }, [isCameraReady, resetShots, startRecordingForShot]);

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

  return {
    videoRef,
    canvasRef,
    shutterAudioRef,

    isCameraReady,
    isShooting: shooting.isShooting,
    countdown: shooting.countdown,
    shotCount,
    remainingShots,

    startCamera,
    startShooting,
    handleShootNow,

    MAX_SHOTS,
    MAX_COUNT,
  };
}
