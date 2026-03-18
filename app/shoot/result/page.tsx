"use client";

import Link from "next/link";
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
  downloadFromUrl,
  downloadBlob,
  recordFrameWebm,
  type FrameSource,
} from "@/lib/canvas/composeFrame";
import { isNotNull } from "@/lib/guards";
import { uploadFourcutMedia } from "@/lib/presignedUploadApi";
import { useThemeDraftStore } from "@/lib/themeDraftStore";

const MAX_SECONDS = 8;

export default function ShootResultPage() {
  const router = useRouter();
  const { frameId, draftId, shots, selectedIndexes } = useShootSession();
  const draft = useThemeDraftStore((s) =>
    draftId ? s.drafts.find((d) => d.id === draftId) : undefined,
  );

  const [borderColor, setBorderColor] = useState("#18181b");
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes],
  );

  useEffect(() => {
    if (!frameId) return router.replace("/shoot");
    if (!shots.length) return router.replace("/shoot/select");
    if (selectedCount !== 4) return router.replace("/shoot/select");
  }, [frameId, shots.length, selectedCount, router]);

  const selectedShots = useMemo(() => {
    return selectedIndexes.map((idx) => {
      if (idx == null) return null;
      return shots[idx] ?? null;
    });
  }, [selectedIndexes, shots]);

  const previewVideo = useMemo(() => {
    return selectedShots.map((shot): FrameMedia | null => {
      if (!shot) return null;
      if (shot.video) return { type: "video", src: shot.video };
      return { type: "image", src: shot.photo };
    });
  }, [selectedShots]);

  const previewImage = useMemo(() => {
    return selectedShots.map((shot): FrameMedia | null => {
      if (!shot) return null;
      return { type: "image", src: shot.photo };
    });
  }, [selectedShots]);

  const pngSources: FrameSource[] = useMemo(() => {
    return selectedShots
      .map((shot) =>
        shot ? ({ type: "image", src: shot.photo } as const) : null,
      )
      .filter(isNotNull);
  }, [selectedShots]);

  const webmSources: FrameSource[] = useMemo(() => {
    return selectedShots
      .map((shot) => {
        if (!shot) return null;
        if (shot.video) return { type: "video", src: shot.video } as const;
        return { type: "image", src: shot.photo } as const;
      })
      .filter((value): value is FrameSource => Boolean(value));
  }, [selectedShots]);

  if (!frameId) return null;

  const layout = FRAME_LAYOUTS[frameId as FrameId];
  const frameConfig = FRAME_CONFIGS.find((frame) => frame.id === frameId);
  const themeData = draft && draft.data.frameId === frameId ? draft.data : null;
  if (!layout) return null;

  const handleDownloadPng = async () => {
    if (pngSources.length !== 4) return;

    setIsDownloadingImage(true);
    try {
      const blob = await composeFramePng({
        layout,
        borderColor,
        sources: pngSources,
        theme: themeData,
        canvas: canvasRef.current ?? undefined,
      });

      const name = (frameConfig?.name ?? "harucut").replace(/\s+/g, "_");
      const filename = `${name}-${Date.now()}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const uploaded = await uploadFourcutMedia(file);
      if (uploaded.downloadUrl) {
        await downloadFromUrl(uploaded.downloadUrl, filename);
      } else {
        downloadBlob(blob, filename);
      }
    } catch (e) {
      console.error(e);
      alert("이미지 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (webmSources.length !== 4) return;

    setIsDownloadingVideo(true);
    try {
      const blob = await recordFrameWebm({
        layout,
        borderColor,
        sources: webmSources,
        theme: themeData,
        seconds: MAX_SECONDS,
        canvas: canvasRef.current ?? undefined,
      });

      const name = (frameConfig?.name ?? "harucut").replace(/\s+/g, "_");
      const filename = `${name}-${Date.now()}.webm`;
      const file = new File([blob], filename, { type: "video/webm" });
      const uploaded = await uploadFourcutMedia(file);
      if (uploaded.downloadUrl) {
        await downloadFromUrl(
          uploaded.downloadUrl,
          filename.replace(/\.webm$/i, ".mp4"),
        );
      } else {
        downloadBlob(blob, filename);
      }
    } catch (e) {
      console.error(e);
      alert("영상 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="촬영 결과"
          backHref="/shoot/select"
          backLabel="다시 고르기"
        />

        <FramePreview
          frameId={frameId}
          media={previewImage}
          borderColor={borderColor}
          theme={themeData}
        />
        <FramePreview
          frameId={frameId}
          media={previewVideo}
          borderColor={borderColor}
          theme={themeData}
        />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {BORDER_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                onClick={() => setBorderColor(color.value)}
                className={[
                  "h-8 rounded-full border px-3 text-[11px]",
                  borderColor === color.value
                    ? "border-emerald-400 text-emerald-200"
                    : "border-zinc-700 text-zinc-300",
                ].join(" ")}
              >
                {color.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isDownloadingImage || selectedCount !== 4}
              className="flex-1 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDownloadingImage ? "이미지 생성 중..." : "사진 다운로드 (PNG)"}
            </button>

            <button
              type="button"
              onClick={handleDownloadVideo}
              disabled={isDownloadingVideo || selectedCount !== 4}
              className="flex-1 rounded-full bg-zinc-700 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDownloadingVideo ? "영상 생성 중..." : "영상 다운로드"}
            </button>
          </div>

          <Link
            href="/home"
            className="inline-flex items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            홈으로 가기
          </Link>
        </section>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
