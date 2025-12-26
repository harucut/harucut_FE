"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { BORDER_COLORS } from "@/constants/colors";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  composeFramePng,
  downloadBlob,
  recordFrameWebm,
  type FrameSource,
} from "@/lib/canvas/composeFrame";

const MAX_SECONDS = 8;
export default function UploadResultPage() {
  const router = useRouter();
  const { frameId, media, selectedIndexes } = useUploadSession();

  const [borderColor, setBorderColor] = useState("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  useEffect(() => {
    if (!frameId) return router.replace("/upload");
    if (!media.length) return router.replace("/upload/select");
    if (selectedCount !== 4) return router.replace("/upload/select");
  }, [frameId, media.length, selectedCount, router]);

  const selectedMedia: (FrameMedia | null)[] = useMemo(
    () =>
      selectedIndexes.map((idx) => {
        if (idx == null) return null;
        return media[idx] ?? null;
      }),
    [selectedIndexes, media]
  );

  const sources: FrameSource[] = useMemo(() => {
    return selectedMedia
      .map((m) => {
        if (!m) return null;
        return m.type === "video"
          ? ({ type: "video", src: m.src } as const)
          : ({ type: "image", src: m.src } as const);
      })
      .filter((v): v is FrameSource => Boolean(v));
  }, [selectedMedia]);

  const hasAnyVideo = useMemo(
    () => selectedMedia.some((m) => m?.type === "video"),
    [selectedMedia]
  );

  const isAllImages = useMemo(
    () => selectedMedia.every((m) => m?.type === "image"),
    [selectedMedia]
  );

  if (!frameId) return null;
  const layout = FRAME_LAYOUTS[frameId as FrameId];
  const frameConfig = FRAME_CONFIGS.find((f) => f.id === frameId);

  if (!layout) return null;

  const handleDownloadPng = async () => {
    if (!isAllImages) return;
    if (sources.length !== 4) return;

    setIsDownloadingImage(true);
    try {
      const blob = await composeFramePng({
        layout,
        borderColor,
        sources,
        canvas: canvasRef.current ?? undefined,
      });

      const name = (frameConfig?.name ?? "recorday").replace(/\s+/g, "_");
      downloadBlob(blob, `${name}-${Date.now()}.png`);
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!hasAnyVideo) {
      alert("동영상이 1개 이상 포함되어야 영상으로 다운로드할 수 있어요.");
      return;
    }
    if (sources.length !== 4) return;

    setIsDownloadingVideo(true);
    try {
      const blob = await recordFrameWebm({
        layout,
        borderColor,
        sources,
        seconds: MAX_SECONDS,
        canvas: canvasRef.current ?? undefined,
      });

      const name = (frameConfig?.name ?? "recorday").replace(/\s+/g, "_");
      downloadBlob(blob, `${name}-${Date.now()}.webm`);
    } catch (e) {
      console.error(e);
      alert("영상 생성 중 오류가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-md flex flex-col gap-6">
        <PageHeader
          title="업로드 · 결과"
          backHref="/upload/select"
          backLabel="다시 고르기"
        />

        <FramePreview
          frameId={frameId}
          media={selectedMedia.map((m) => m ?? { type: "image", src: "" })}
          borderColor={borderColor}
        />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {BORDER_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setBorderColor(c.value)}
                className={[
                  "h-8 rounded-full px-3 text-[11px] border",
                  borderColor === c.value
                    ? "border-emerald-400 text-emerald-200"
                    : "border-zinc-700 text-zinc-300",
                ].join(" ")}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={
                isDownloadingImage || !isAllImages || selectedCount !== 4
              }
              className="flex-1 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloadingImage ? "이미지 생성 중..." : "사진 다운로드 (PNG)"}
            </button>

            <button
              type="button"
              onClick={handleDownloadVideo}
              disabled={isDownloadingVideo || !hasAnyVideo}
              className="flex-1 rounded-full bg-zinc-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isDownloadingVideo ? "영상 생성 중..." : "동영상 다운로드"}
            </button>
          </div>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
