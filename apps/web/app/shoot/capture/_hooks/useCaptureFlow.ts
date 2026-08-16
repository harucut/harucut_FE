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
  // 타이머 간격은 "촬영 시작 전에만" 고를 수 있다(촬영 중에는 칩이 비활성으로 남는다).
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
  // 진행 중인 카운트다운 타이머. 촬영 취소에서 즉시 정리하려고 따로 들고 있는다.
  const countdownTimerRef = useRef<number | null>(null);
  /**
   * 촬영 회차 번호.
   *
   * 한 컷의 인코딩(toBlob → FileReader)은 비동기라, 그 사이에 사용자가 촬영 취소를 누르면
   * 세션이 비워진 뒤에 결과가 돌아온다. 그대로 두면 취소한 사진이 다시 담기고, 마지막 컷을
   * 인코딩하던 중이었다면 /shoot/select 로 넘어가 취소 자체가 무효가 됐다.
   * 시작·취소 때마다 번호를 올리고, 인코딩 전후로 번호가 같은지 본다.
   */
  const shootGenerationRef = useRef(0);

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
          "카메라 접근이 거부됐거나 오류가 났어요. 브라우저 권한을 확인한 뒤 다시 시도해 주세요.",
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
      // 인코딩이 도는 중에 헤더의 뒤로 가기나 브랜드 링크로 화면을 떠나면 취소를 거치지
      // 않는다. 그대로 두면 결과가 돌아와 전역 세션에 사진이 얹히고, 마지막 컷이었다면
      // 떠난 화면에서 /shoot/select 로 다시 밀어 넣는다. 취소와 같게 무효로 만든다.
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

    // 셔터음은 인코딩을 기다리지 않고 즉시 낸다 — 누른 순간과 소리가 붙어 있어야 한다.
    playShutterSound();

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

    // 인코딩 중에 취소됐으면 결과를 버린다. 선점도 되돌리지 않는다 — 취소가 이미 초기화했다.
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
      countdownTimerRef.current = null;
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

    countdownTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (countdownTimerRef.current === timer) countdownTimerRef.current = null;
    };
  }, [shooting.isShooting, shooting.countdown, finishSingleShot]);

  const handleShootNow = useCallback(() => {
    if (!shooting.isShooting || !isCameraReady) return;
    void finishSingleShot();
  }, [shooting.isShooting, isCameraReady, finishSingleShot]);

  // 촬영 취소: 진행 중인 카운트다운을 즉시 끊고 세션을 시작 전 상태로 되돌린다.
  // 8초 간격이면 8장을 다 찍는 데 1분 가까이 걸려, 중단 수단이 없으면 되돌릴 방법이 없다.
  const cancelShooting = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    isShootingRef.current = false;
    lastFinishedShotRef.current = -1;
    // 진행 중인 인코딩의 결과를 무효로 만든다.
    shootGenerationRef.current += 1;
    setShooting({ isShooting: false, countdown: null });
    resetShots();
    setShotCount(0);
  }, [resetShots]);

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

    timerSeconds,
    setTimerSeconds,

    startCamera,
    startShooting,
    handleShootNow,
    cancelShooting,
    switchCamera,

    MAX_SHOTS,
    TIMER_OPTIONS,
  };
}
