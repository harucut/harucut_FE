"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { centerCrop } from "@/lib/canvas/captureCrop";

/**
 * 행사 참가·부스 촬영용 카메라.
 *
 * 개인 촬영 훅(app/shoot/capture/_hooks/useCaptureFlow)은 개인 촬영 저장소·게스트 상태·라우터에
 * 묶여 있어 행사 흐름에 가져오지 않는다. 화면이 쓰는 것만 둔다: 스트림 시작·정지, 한 장 찍기.
 *
 * 권한이 없거나 브라우저가 카메라를 못 쓰면 상태로 알릴 뿐 **갤러리 불러오기로 대신하지 않는다**
 * (기획 R5 「배포형 체험의 촬영 전용 규칙」). 지원 브라우저로 여는 안내는 화면이 한다.
 * 촬영본은 메모리(Blob)로만 돌려준다 — 저장소에 남기지 않는다(R5 4절, 부스 회차 초기화).
 */
export type EventCameraState = "idle" | "starting" | "ready" | "denied" | "unsupported" | "error";

/** 결과에 쓰는 긴 변 상한. 합성 칸(최대 2400)보다 크게 두지 않는다. */
const MAX_LONG_EDGE = 2400;

export function useEventCamera(slotAspect: number) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const [state, setState] = useState<EventCameraState>("idle");

  const stop = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    const generation = ++generationRef.current;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setState("unsupported");
      return;
    }
    setState("starting");
    try {
      const portrait = slotAspect < 1;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: portrait ? 2160 : 3840 },
          height: { ideal: portrait ? 3840 : 2160 },
        },
        audio: false,
      });
      // 늦게 끝난 요청이 그사이 시작된 다른 회차의 카메라를 덮지 않게 한다.
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (generation === generationRef.current) setState("ready");
    } catch (error) {
      if (generation !== generationRef.current) return;
      const name = (error as { name?: string } | null)?.name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
    }
  }, [slotAspect]);

  /** 지금 화면을 칸 비율로 가운데를 잘라 JPEG 한 장으로 만든다. 거울상은 화면만 그렇고 결과는 원래 방향이다. */
  const capture = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error("카메라가 아직 준비되지 않았어요.");
    }
    const crop = centerCrop(video.videoWidth, video.videoHeight, slotAspect);
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(crop.sw, crop.sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.sw * scale);
    canvas.height = Math.round(crop.sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 만들지 못했어요.");
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("사진을 만들지 못했어요."))),
        "image/jpeg",
        0.9,
      );
    });
  }, [slotAspect]);

  useEffect(() => () => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  return { videoRef, state, start, stop, capture };
}
