"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { loadImage, loadVideo } from "@/lib/canvas/loaders";
import { drawCover } from "@/lib/canvas/drawCover";
import { BORDER_COLORS } from "@/constants/colors";
import { PageHeader } from "@/components/layout/PageHeader";

const MAX_SECONDS = 8;

export default function ResultPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes } = useShootSession();

  const [borderColor, setBorderColor] = useState<string>("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 선택 개수
  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  useEffect(() => {
    if (!frameId) return router.replace("/shoot");
    if (!shots.length) return router.replace("/shoot/capture");
    if (selectedCount !== 4) return router.replace("/shoot/select");
  }, [frameId, shots.length, selectedCount, router]);

  // 슬롯에 들어갈 media (선택 순서 그대로)
  const slotMedia: (FrameMedia | null)[] = useMemo(
    () =>
      selectedIndexes.map((idx) => {
        if (idx == null) return null;
        const shot = shots[idx];
        if (!shot) return null;

        return shot.video
          ? { type: "video", src: shot.video }
          : { type: "image", src: shot.photo };
      }),
    [selectedIndexes, shots]
  );

  // PNG 합성을 위한 "사진만" 배열 (선택 순서 그대로)
  const selectedPhotosForFrame = useMemo(
    () =>
      selectedIndexes
        .map((idx) => (idx == null ? null : shots[idx]?.photo ?? null))
        .filter((p): p is string => Boolean(p))
        .slice(0, 4),
    [selectedIndexes, shots]
  );

  // 영상 합성용: 선택된 4칸 모두에 video가 있는지
  const hasAllVideos = useMemo(
    () =>
      selectedIndexes.every((idx) => {
        if (idx == null) return false;
        return Boolean(shots[idx]?.video);
      }),
    [selectedIndexes, shots]
  );

  if (!frameId) return null;
  const frameConfig = FRAME_CONFIGS.find((f) => f.id === frameId);
  const layout = FRAME_LAYOUTS[frameId as FrameId];
  if (!layout) return null;

  // PNG 다운로드
  const handleDownloadPng = async () => {
    if (selectedPhotosForFrame.length !== 4) return;
    if (!canvasRef.current) return;

    setIsDownloadingImage(true);
    try {
      const images = await Promise.all(selectedPhotosForFrame.map(loadImage));

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

        const iw = img.naturalWidth || img.width || 1;
        const ih = img.naturalHeight || img.height || 1;
        drawCover(ctx, img, iw, ih, slot);
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
    if (!hasAllVideos) {
      alert("선택된 4개의 샷에 모두 영상이 있어야 합니다.");
      return;
    }
    if (!canvasRef.current) return;

    setIsDownloadingVideo(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { totalWidth, totalHeight, slots } = layout;
      canvas.width = totalWidth;
      canvas.height = totalHeight;

      const urls = selectedIndexes.map((idx) =>
        idx == null ? null : shots[idx]?.video ?? null
      );
      const videos = await Promise.all(
        urls.map((u, i) => {
          if (!u) throw new Error(`slot ${i} has no video`);
          return loadVideo(u);
        })
      );

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

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const frameName = frameConfig?.name ?? "recorday";
          a.href = url;
          a.download = `${frameName.replace(/\s+/g, "_")}-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      videos.forEach((v) => {
        v.currentTime = 0;
        v.loop = true;
      });

      recorder.start();

      await Promise.all(videos.map((v) => v.play().catch(() => undefined)));

      const start = performance.now();
      const duration = MAX_SECONDS;

      const render = () => {
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed >= duration) {
          recorder.stop();
          videos.forEach((v) => v.pause());
          return;
        }

        ctx.fillStyle = borderColor;
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        slots.forEach((slot, i) => {
          const v = videos[i];
          if (!v || v.readyState < 2) return;
          drawCover(ctx, v, v.videoWidth || 1, v.videoHeight || 1, slot);
        });

        requestAnimationFrame(render);
      };

      render();
      await stopped;
    } catch (e) {
      console.error(e);
      alert("영상 합성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <PageHeader
          title="최종 결과 · 다운로드"
          backHref="/shoot/select"
          backLabel="사진 다시 선택"
        />
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
            위 구성으로 PNG / webm 영상이 생성돼요.
          </p>
        </section>

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
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isDownloadingImage || selectedCount !== 4}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDownloadingImage ? "이미지 생성 중..." : "사진 다운로드 (PNG)"}
          </button>

          <button
            type="button"
            onClick={handleDownloadVideo}
            disabled={isDownloadingVideo || !hasAllVideos}
            className="rounded-full bg-zinc-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDownloadingVideo ? "영상 생성 중..." : "동영상 다운로드"}
          </button>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
