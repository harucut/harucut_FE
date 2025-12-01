"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";

const MAX_SHOTS = 8;
const MAX_COUNT = 10;

export default function CapturePage() {
  const router = useRouter();
  const { frameId, addShot, resetShots, shots } = useShootSession();

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isShooting, setIsShooting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const remainingShots = Math.max(0, MAX_SHOTS - shots.length);

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
    }
  }, [frameId, router]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("이 브라우저에서는 카메라 사용을 지원하지 않아요.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraReady(true);
    } catch (err) {
      console.error(err);
      alert("카메라 접근이 거부되었거나 오류가 발생했어요.");
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = video.videoWidth || 480;
    const height = video.videoHeight || 640;
    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    addShot(dataUrl);
  };

  const startShooting = () => {
    if (!isCameraReady) {
      alert("먼저 카메라를 켜주세요.");
      return;
    }
    resetShots();
    setIsShooting(true);
    setCountdown(MAX_COUNT);
  };

  useEffect(() => {
    if (!isShooting) return;
    if (countdown === null) return;

    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        capturePhoto();
        const taken = shots.length + 1;

        if (taken >= MAX_SHOTS) {
          setIsShooting(false);
          setCountdown(null);
          router.push("/shoot/select");
        } else {
          setCountdown(MAX_COUNT);
        }
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isShooting, countdown, shots.length, router]);

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              사진 촬영 · 8장 자동 촬영
            </h1>
          </div>
          <Link
            href="/shoot"
            className="text-xs text-zinc-400 underline underline-offset-4"
          >
            프레임 다시 선택
          </Link>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>2단계 · 카메라 촬영 {isShooting && "· 자동 촬영 중"}</span>
            <span className="rounded-full border border-zinc-700 px-2 py-0.5">
              {shots.length} / {MAX_SHOTS}장 촬영됨
            </span>
          </div>

          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain"
            />
            <canvas ref={canvasRef} className="hidden" />

            {isShooting && countdown !== null && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400 text-2xl font-semibold">
                    {countdown}
                  </div>
                  <span className="text-xs text-zinc-200">
                    다음 촬영까지 남은 시간
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    남은 사진 {remainingShots}장
                  </span>
                </div>
              </div>
            )}

            {!isShooting && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                <p className="px-4 text-center text-[11px] text-zinc-200">
                  카메라를 켜고{" "}
                  <span className="font-semibold">
                    &quot;{MAX_SHOTS}장 자동 촬영 시작&quot;
                  </span>{" "}
                  버튼을 누르면
                  <br />${MAX_COUNT}초 간격으로 사진을 촬영해요.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span
                className={`inline-flex h-2 w-2 rounded-full ${
                  isCameraReady ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              <span>
                카메라 {isCameraReady ? "준비 완료" : "아직 꺼져 있어요"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
              >
                카메라 켜기
              </button>
              <button
                type="button"
                onClick={startShooting}
                disabled={!isCameraReady || isShooting}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isShooting ? "촬영 중..." : "8장 자동 촬영 시작"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
