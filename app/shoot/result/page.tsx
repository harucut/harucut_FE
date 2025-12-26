"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
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

export default function ShootResultPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes } = useShootSession();

  const [borderColor, setBorderColor] = useState("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  useEffect(() => {
    if (!frameId) return router.replace("/shoot");
    if (!shots.length) return router.replace("/shoot/select");
    if (selectedCount !== 4) return router.replace("/shoot/select");
  }, [frameId, shots.length, selectedCount, router]);

  // 선택 순서대로 shot 가져오기
  const selectedShots = useMemo(() => {
    return selectedIndexes.map((idx) => {
      if (idx == null) return null;
      return shots[idx] ?? null;
    });
  }, [selectedIndexes, shots]);

  // 프리뷰: video가 있으면 video를 보여주고, 없으면 photo
  const previewMedia: FrameMedia[] = useMemo(() => {
    return selectedShots.map((s) => {
      if (!s) return { type: "image", src: "" };
      if (s.video) return { type: "video", src: s.video };
      return { type: "image", src: s.photo };
    });
  }, [selectedShots]);

  // 합성 소스: video 있으면 video, 아니면 image(photo)
  const sources: FrameSource[] = useMemo(() => {
    return selectedShots
      .map((s) => {
        if (!s) return null;
        if (s.video) return { type: "video", src: s.video } as const;
        return { type: "image", src: s.photo } as const;
      })
      .filter((v): v is FrameSource => Boolean(v));
  }, [selectedShots]);

  // PNG는 "전부 사진"일 때만
  const isAllImages = useMemo(
    () => selectedShots.every((s) => s && !s.video),
    [selectedShots]
  );

  const hasAnyVideo = useMemo(
    () => selectedShots.some((s) => Boolean(s?.video)),
    [selectedShots]
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
          title="촬영 · 결과"
          backHref="/shoot/select"
          backLabel="다시 고르기"
        />

        <FramePreview
          frameId={frameId}
          media={previewMedia}
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
