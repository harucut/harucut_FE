"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import {
  FramePreview,
  FRAME_LAYOUTS,
  type FrameMedia,
} from "@/components/frame/FramePreview";

const BORDER_COLORS = [
  { id: "black", label: "블랙", value: "#000000" },
  { id: "white", label: "화이트", value: "#ffffff" },
  { id: "zinc", label: "다크 그레이", value: "#18181b" },
  { id: "pink", label: "핑크", value: "#f973b6" },
  { id: "blue", label: "블루", value: "#38bdf8" },
] as const;

const MAX_SECONDS = 8;

type SlotDrawable =
  | { kind: "video"; el: HTMLVideoElement }
  | { kind: "image"; el: HTMLImageElement };

export default function ResultPage() {
  const router = useRouter();
  const { frameId, media, selectedIndexes } = useUploadSession();

  const [borderColor, setBorderColor] = useState<string>("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const targetDuration = MAX_SECONDS;

  // 선택 개수
  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
      return;
    }
    if (!media.length) {
      router.replace("/upload/select");
      return;
    }
    if (selectedCount !== 4) {
      router.replace("/upload/select");
      return;
    }
  }, [frameId, media.length, selectedCount, router]);

  const selectedMedia: (FrameMedia | null)[] = useMemo(
    () =>
      selectedIndexes.map((idx) => {
        if (idx == null) return null;
        return media[idx] ?? null;
      }),
    [selectedIndexes, media]
  );

  // 슬롯에 들어갈 media (선택 순서 그대로)
  const slotMedia: (FrameMedia | null)[] = useMemo(
    () =>
      selectedMedia.map((m) => {
        if (!m) return null;
        return m.type === "video"
          ? { type: "video", src: m.src }
          : { type: "image", src: m.src };
      }),
    [selectedMedia]
  );

  const isAllImages = useMemo(
    () => selectedMedia.every((m) => m?.type === "image"),
    [selectedMedia]
  );

  // PNG 합성을 위한 "사진만" 배열 (선택 순서 그대로)
  const selectedPhotosForFrame: string[] = useMemo(() => {
    if (!isAllImages) return [];
    return selectedMedia
      .map((m) => (m?.type === "image" ? m.src : null))
      .filter((v): v is string => Boolean(v))
      .slice(0, 4);
  }, [selectedMedia, isAllImages]);

  // 영상 합성용: 선택된 4칸 모두에 video가 있는지
  const hasAnyVideo = useMemo(
    () => selectedMedia.some((m) => m?.type === "video"),
    [selectedMedia]
  );

  if (!frameId) return null;

  const frameConfig = FRAME_CONFIGS.find((f) => f.id === frameId);
  const layout = FRAME_LAYOUTS[frameId as FrameId];
  if (!layout) return null;

  // PNG 다운로드
  const handleDownloadPng = async () => {
    if (!isAllImages) return;
    if (selectedPhotosForFrame.length !== 4) return;
    if (!canvasRef.current) return;

    setIsDownloadingImage(true);
    try {
      const images = await Promise.all(
        selectedPhotosForFrame.map(
          (src) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
            })
        )
      );

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { totalWidth, totalHeight, slots } = layout;
      canvas.width = totalWidth;
      canvas.height = totalHeight;

      ctx.fillStyle = borderColor;
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      slots.forEach((slot, index) => {
        const img = images[index];
        if (!img) return;

        const { x, y, width, height } = slot;

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;

        const scale = Math.max(width / iw, height / ih);
        const sw = iw * scale;
        const sh = ih * scale;
        const dx = x + (width - sw) / 2;
        const dy = y + (height - sh) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.drawImage(img, dx, dy, sw, sh);
        ctx.restore();
      });

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      const frameName = frameConfig?.name ?? "recorday";
      link.download = `${frameName.replace(/\s+/g, "_")}-${Date.now()}.png`;
      link.click();
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingImage(false);
    }
  };

  // 프레임 안에 4개 영상이 동시에 들어간 하나의 영상 만들기
  const handleDownloadVideo = async () => {
    if (!hasAnyVideo) {
      alert("동영상이 1개 이상 포함되어야 영상으로 다운로드할 수 있어요.");
      return;
    }
    if (!canvasRef.current) return;

    setIsDownloadingVideo(true);
    try {
      const { totalWidth, totalHeight, slots } = layout;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = totalWidth;
      canvas.height = totalHeight;

      // 슬롯별 drawable 로드 (image/video 섞임)
      const drawables: SlotDrawable[] = await Promise.all(
        selectedMedia.map((m, i) => {
          return new Promise<SlotDrawable>((resolve, reject) => {
            if (!m) return reject(new Error(`slot ${i} has no media`));

            if (m.type === "video") {
              const v = document.createElement("video");
              v.src = m.src;
              v.muted = true;
              v.playsInline = true;
              v.crossOrigin = "anonymous";
              v.loop = true;

              const onLoaded = () => {
                v.removeEventListener("loadedmetadata", onLoaded);
                v.removeEventListener("error", onError);
                v.currentTime = 0;
                resolve({ kind: "video", el: v });
              };

              const onError = () => {
                v.removeEventListener("loadedmetadata", onLoaded);
                v.removeEventListener("error", onError);
                reject(
                  new Error(
                    `video load error (slot ${i}): ${
                      v.error?.message ?? "unknown error"
                    }`
                  )
                );
              };

              v.addEventListener("loadedmetadata", onLoaded);
              v.addEventListener("error", onError);
              return;
            }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve({ kind: "image", el: img });
            img.onerror = () =>
              reject(new Error(`image load error (slot ${i})`));
            img.src = m.src;
          });
        })
      );

      const duration = targetDuration;

      // 녹화 준비
      const fps = 30;
      const stream = canvas.captureStream(fps);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const frameName = frameConfig?.name ?? "recorday";

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${frameName.replace(/\s+/g, "_")}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      recorder.start();

      // video만 play 시작
      await Promise.all(
        drawables
          .filter(
            (d): d is { kind: "video"; el: HTMLVideoElement } =>
              d.kind === "video"
          )
          .map((d) => d.el.play().catch(() => undefined))
      );

      const start = performance.now();

      const renderFrame = () => {
        const elapsed = (performance.now() - start) / 1000;

        if (elapsed >= duration) {
          recorder.stop();
          drawables.forEach((d) => {
            if (d.kind === "video") d.el.pause();
          });
          return;
        }

        // 배경(테두리 색)
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // 슬롯별 draw
        slots.forEach((slot, index) => {
          const d = drawables[index];
          if (!d) return;

          const { x, y, width, height } = slot;

          let srcW = 1;
          let srcH = 1;
          let drawableEl: CanvasImageSource | null = null;

          if (d.kind === "video") {
            const v = d.el;
            if (v.readyState < 2) return;
            drawableEl = v;
            srcW = v.videoWidth || 1;
            srcH = v.videoHeight || 1;
          } else {
            const img = d.el;
            drawableEl = img;
            srcW = img.naturalWidth || img.width || 1;
            srcH = img.naturalHeight || img.height || 1;
          }

          const scale = Math.max(width / srcW, height / srcH);
          const dw = srcW * scale;
          const dh = srcH * scale;
          const dx = x + (width - dw) / 2;
          const dy = y + (height - dh) / 2;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, width, height);
          ctx.clip();
          ctx.drawImage(drawableEl, dx, dy, dw, dh);
          ctx.restore();
        });

        requestAnimationFrame(renderFrame);
      };

      renderFrame();
      await stopped;
    } catch (e) {
      console.error(e);
      alert("영상 합성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  const handleGoHome = () => {
    router.push("/home");
  };

  const canDownloadPng = selectedCount === 4 && isAllImages;

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        {/* 헤더 */}
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] tracking-[0.16em] text-zinc-500">
              RECORDAY
            </span>
            <h1 className="text-lg font-semibold tracking-tight">
              최종 결과 · 다운로드
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/upload/select"
              className="text-[11px] text-zinc-400 underline underline-offset-4"
            >
              사진 다시 선택
            </Link>
          </div>
        </header>

        {/* 미리보기 */}
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-zinc-300">
            사진 + 영상 미리보기
          </h2>

          <div className="flex h-[330px] justify-center">
            <FramePreview
              variant={frameId as FrameId}
              media={slotMedia}
              className="bg-transparent border-none p-0"
              borderColor={borderColor}
            />
          </div>

          <p className="text-[10px] text-zinc-500 text-center">
            선택한 구성으로 PNG(사진) 또는 webm(영상)을 만들어요.
          </p>
        </section>

        {/* 테두리 색 선택 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-300">테두리 색 선택</h3>
          <div className="flex flex-wrap gap-2">
            {BORDER_COLORS.map((c) => {
              const isActive = borderColor === c.value;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBorderColor(c.value)}
                  className={[
                    "flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px]",
                    isActive
                      ? "border-emerald-400 bg-zinc-900"
                      : "border-zinc-700 bg-zinc-900/60 hover:border-zinc-500",
                  ].join(" ")}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-zinc-800"
                    style={{ backgroundColor: c.value }}
                  />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-4 flex flex-wrap justify-end gap-2">
          {/* 사진다운로드 */}
          {hasAnyVideo ? (
            <button
              type="button"
              onClick={handleDownloadVideo}
              disabled={isDownloadingVideo || selectedCount !== 4}
              className="rounded-full bg-zinc-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloadingVideo ? "영상 생성 중..." : "동영상 다운로드"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isDownloadingImage || !canDownloadPng}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloadingImage ? "이미지 생성 중..." : "사진 다운로드 (PNG)"}
            </button>
          )}

          {/* 홈으로 돌아가기 */}
          <button
            type="button"
            onClick={handleGoHome}
            className="rounded-full bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            홈으로 돌아가기
          </button>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
