"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratedAssetDownloadCard } from "@/components/frame/GeneratedAssetDownloadCard";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  buildDefaultDisplayName,
  sanitizeDisplayName,
} from "@/lib/fourcutOutput";
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import { useThemeDraftStore } from "@/lib/themeDraftStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useVideoConversionQuotaStore } from "@/lib/videoConversionQuotaStore";
import {
  composeFramePng,
  downloadFromUrl,
  recordFrameWebm,
  type FrameSource,
} from "@/lib/canvas/composeFrame";

const MAX_SECONDS = 8;

type ProcessingState = "idle" | "processing" | "done" | "error";

export default function UploadResultPage() {
  const router = useRouter();
  const {
    frameId,
    draftId,
    media,
    selectedIndexes,
    borderColor,
    includeVideo,
    imageResult,
    videoResult,
    setImageResult,
    setVideoResult,
    clearResults,
  } = useUploadSession();
  const draft = useThemeDraftStore((state) =>
    draftId ? state.drafts.find((item) => item.id === draftId) : undefined,
  );
  const consumeVideoConversion = useVideoConversionQuotaStore((state) => state.consume);
  const usedVideoConversions = useVideoConversionQuotaStore((state) => state.usedCount);
  const videoConversionLimit = useVideoConversionQuotaStore((state) => state.limit);

  const [imageState, setImageState] = useState<ProcessingState>(
    imageResult ? "done" : "idle",
  );
  const [videoState, setVideoState] = useState<ProcessingState>(
    videoResult ? "done" : "idle",
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [imageNameDraft, setImageNameDraft] = useState(imageResult?.displayName ?? "");
  const [videoNameDraft, setVideoNameDraft] = useState(videoResult?.displayName ?? "");
  const [isSavingImageName, setIsSavingImageName] = useState(false);
  const [isSavingVideoName, setIsSavingVideoName] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isDownloadingVideo, setIsDownloadingVideo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
      return;
    }

    if (!media.length || selectedCount !== 4) {
      router.replace("/upload/select");
    }
  }, [frameId, media.length, router, selectedCount]);

  const selectedMedia = useMemo(
    () => selectedIndexes.map((index) => (index == null ? null : media[index] ?? null)),
    [media, selectedIndexes],
  );
  const previewImage = useMemo(
    () =>
      selectedMedia.map((item): FrameMedia | null => {
        if (!item) return null;
        return item.type === "image"
          ? { type: "image", src: item.src }
          : { type: "video", src: item.src };
      }),
    [selectedMedia],
  );
  const previewVideo = useMemo(
    () =>
      selectedMedia.map((item): FrameMedia | null => {
        if (!item) return null;
        return item.type === "video"
          ? { type: "video", src: item.src }
          : { type: "image", src: item.src };
      }),
    [selectedMedia],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedMedia
        .map((item) => {
          if (!item) return null;
          return item.type === "video"
            ? ({ type: "video", src: item.src } as const)
            : ({ type: "image", src: item.src } as const);
        })
        .filter((value): value is FrameSource => Boolean(value)),
    [selectedMedia],
  );
  const videoSources = imageSources;

  const themeData =
    draft && frameId && draft.data.frameId === frameId ? draft.data : null;
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);
  const layout = frameId ? FRAME_LAYOUTS[frameId as FrameId] : null;
  const frameConfig = FRAME_CONFIGS.find((frame) => frame.id === frameId);
  const videoEligible = useMemo(
    () => selectedMedia.some((item) => item?.type === "video"),
    [selectedMedia],
  );
  const shouldPrepareVideo = includeVideo && videoEligible;
  const remainingVideoConversions = Math.max(
    videoConversionLimit - usedVideoConversions,
    0,
  );

  useEffect(() => {
    setImageState(imageResult ? "done" : "idle");
    setImageNameDraft(imageResult?.displayName ?? "");
  }, [imageResult]);

  useEffect(() => {
    setVideoState(videoResult ? "done" : "idle");
    setVideoNameDraft(videoResult?.displayName ?? "");
  }, [videoResult]);

  useEffect(() => {
    if (!frameId || !layout || selectedCount !== 4) return;

    let cancelled = false;
    const currentLayout = layout;

    async function prepareOutputs() {
      if (!imageResult) {
        setImageError(null);
        setImageState("processing");

        try {
          const blob = await composeFramePng({
            layout: currentLayout,
            borderColor: effectiveBorderColor,
            sources: imageSources,
            theme: themeData,
            canvas: canvasRef.current ?? undefined,
          });

          const displayName = buildDefaultDisplayName(
            frameConfig?.name ?? "harucut",
            "IMAGE",
          );
          const file = new File([blob], `${displayName}.png`, {
            type: "image/png",
          });
          const asset = await uploadGeneratedFourcutFile({
            file,
            kind: "IMAGE",
            displayName,
            extension: "png",
          });

          if (!cancelled) {
            setImageResult(asset);
            setImageState("done");
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) {
            setImageState("error");
            setImageError("이미지를 준비하지 못했어요. 다시 시도해 주세요.");
          }
        }
      }

      if (!shouldPrepareVideo) {
        if (!cancelled) {
          setVideoState("idle");
          setVideoError(null);
        }
        return;
      }

      if (videoResult) {
        if (!cancelled) {
          setVideoState("done");
        }
        return;
      }

      if (remainingVideoConversions <= 0) {
        if (!cancelled) {
          setVideoState("error");
          setVideoError("남은 동영상 변환 횟수가 없어요.");
        }
        return;
      }

      setVideoError(null);
      setVideoState("processing");

      try {
        const blob = await recordFrameWebm({
          layout: currentLayout,
          borderColor: effectiveBorderColor,
          sources: videoSources,
          theme: themeData,
          seconds: MAX_SECONDS,
          canvas: canvasRef.current ?? undefined,
        });

        const displayName = buildDefaultDisplayName(
          frameConfig?.name ?? "harucut",
          "VIDEO",
        );
        const file = new File([blob], `${displayName}.webm`, {
          type: "video/webm",
        });
        const asset = await uploadGeneratedFourcutFile({
          file,
          kind: "VIDEO",
          displayName,
          extension: "mp4",
        });

        if (!cancelled) {
          setVideoResult(asset);
          setVideoState("done");
          consumeVideoConversion();
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setVideoState("error");
          setVideoError("동영상을 준비하지 못했어요. 다시 시도해 주세요.");
        }
      }
    }

    void prepareOutputs();

    return () => {
      cancelled = true;
    };
  }, [
    consumeVideoConversion,
    effectiveBorderColor,
    frameConfig?.name,
    frameId,
    imageResult,
    imageSources,
    layout,
    remainingVideoConversions,
    selectedCount,
    setImageResult,
    setVideoResult,
    shouldPrepareVideo,
    themeData,
    videoResult,
    videoSources,
  ]);

  if (!frameId || !layout) return null;

  const isPreparing =
    imageState === "processing" || videoState === "processing" || imageState === "idle";

  const syncDisplayName = async (
    asset: NonNullable<typeof imageResult>,
    nextName: string,
    updateAsset: (displayName: string) => void,
  ) => {
    const sanitizedName = sanitizeDisplayName(nextName, asset.displayName);
    const updated = await updateMediaDisplayName(asset.mediaId, sanitizedName);
    const resolvedName =
      updated.displayName?.trim() ||
      updated.displayname?.trim() ||
      sanitizedName;

    updateAsset(resolvedName);
    return resolvedName;
  };

  const handleSaveImageName = async () => {
    if (!imageResult) return;

    setIsSavingImageName(true);
    try {
      const nextName = sanitizeDisplayName(imageNameDraft, imageResult.displayName);
      if (nextName === imageResult.displayName) {
        setImageNameDraft(imageResult.displayName);
        return;
      }

      const resolvedName = await syncDisplayName(imageResult, imageNameDraft, (displayName) =>
        setImageResult({ ...imageResult, displayName }),
      );
      setImageNameDraft(resolvedName);
    } catch (error) {
      console.error(error);
      alert("이미지 이름을 저장하지 못했어요.");
    } finally {
      setIsSavingImageName(false);
    }
  };

  const handleSaveVideoName = async () => {
    if (!videoResult) return;

    setIsSavingVideoName(true);
    try {
      const nextName = sanitizeDisplayName(videoNameDraft, videoResult.displayName);
      if (nextName === videoResult.displayName) {
        setVideoNameDraft(videoResult.displayName);
        return;
      }

      const resolvedName = await syncDisplayName(videoResult, videoNameDraft, (displayName) =>
        setVideoResult({ ...videoResult, displayName }),
      );
      setVideoNameDraft(resolvedName);
    } catch (error) {
      console.error(error);
      alert("동영상 이름을 저장하지 못했어요.");
    } finally {
      setIsSavingVideoName(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!imageResult) return;

    setIsDownloadingImage(true);
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      await downloadFromUrl(url);
    } catch (error) {
      console.error(error);
      alert("이미지를 다운로드하지 못했어요.");
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!videoResult) return;

    setIsDownloadingVideo(true);
    try {
      const url = await getMediaDownloadUrl(videoResult.mediaId);
      await downloadFromUrl(url);
    } catch (error) {
      console.error(error);
      alert("동영상을 다운로드하지 못했어요.");
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="업로드 결과"
          description="선택한 미디어로 결과물을 준비하고 있어요."
        />

        <FramePreview
          frameId={frameId}
          media={previewImage}
          borderColor={effectiveBorderColor}
          theme={themeData}
        />

        {shouldPrepareVideo ? (
          <FramePreview
            frameId={frameId}
            media={previewVideo}
            borderColor={effectiveBorderColor}
            theme={themeData}
          />
        ) : null}

        {isPreparing ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">결과 준비 중</h2>
                <p className="mt-1 text-[11px] text-zinc-500">
                  파일 업로드와 변환이 끝나면 다운로드 버튼이 열려요.
                </p>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span>이미지 준비</span>
                  <span className="text-zinc-400">
                    {imageState === "done"
                      ? "완료"
                      : imageState === "processing"
                        ? "생성 중..."
                        : imageState === "error"
                          ? "실패"
                          : "대기 중"}
                  </span>
                </div>

                {shouldPrepareVideo ? (
                  <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <span>동영상 준비</span>
                    <span className="text-zinc-400">
                      {videoState === "done"
                        ? "완료"
                        : videoState === "processing"
                          ? "변환 중..."
                          : videoState === "error"
                            ? "실패"
                            : "대기 중"}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-zinc-400">
                    이번 결과는 이미지만 준비해요.
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {imageError ? (
          <p className="text-[11px] text-red-300">{imageError}</p>
        ) : null}
        {videoError ? (
          <p className="text-[11px] text-red-300">{videoError}</p>
        ) : null}

        {imageState === "error" || videoState === "error" ? (
          <button
            type="button"
            onClick={() => {
              clearResults();
              setImageState("idle");
              setVideoState("idle");
              setImageError(null);
              setVideoError(null);
            }}
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-900"
          >
            다시 준비하기
          </button>
        ) : null}

        {imageResult ? (
          <GeneratedAssetDownloadCard
            title="이미지 다운로드"
            description="기록에 저장될 이미지 이름을 수정할 수 있어요."
            asset={imageResult}
            draftName={imageNameDraft}
            onChangeName={setImageNameDraft}
            onSaveName={handleSaveImageName}
            onDownload={handleDownloadImage}
            isSavingName={isSavingImageName}
            isDownloading={isDownloadingImage}
          />
        ) : null}

        {videoResult ? (
          <GeneratedAssetDownloadCard
            title="동영상 다운로드"
            description="동영상은 한 번 준비된 파일을 그대로 내려받기 때문에 기록이 더 쌓이지 않아요."
            asset={videoResult}
            draftName={videoNameDraft}
            onChangeName={setVideoNameDraft}
            onSaveName={handleSaveVideoName}
            onDownload={handleDownloadVideo}
            isSavingName={isSavingVideoName}
            isDownloading={isDownloadingVideo}
          />
        ) : null}

        <div className="flex gap-2">
          <Link
            href="/upload/select"
            className="flex-1 rounded-full border border-zinc-700 px-4 py-2 text-center text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            사진 다시 고르기
          </Link>
          <Link
            href="/home"
            className="flex-1 rounded-full border border-zinc-700 px-4 py-2 text-center text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            홈으로 가기
          </Link>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
