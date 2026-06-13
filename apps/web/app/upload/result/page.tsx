"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratedAssetDownloadCard } from "@/components/frame/GeneratedAssetDownloadCard";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { FRAME_CONFIGS, type FrameId } from "@/constants/frames";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { getUserFacingApiErrorMessage } from "@/lib/apiError";
import {
  composeFramePng,
  downloadFromUrl,
  recordFrameWebm,
  type FrameSource,
} from "@/lib/canvas/composeFrame";
import {
  buildDefaultDisplayName,
  buildDownloadFilename,
  sanitizeDisplayName,
} from "@/lib/fourcutOutput";
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import {
  MAX_FOURCUT_VIDEO_SECONDS,
  TRIMMED_VIDEO_NOTICE,
  hasVideoSourceLongerThan,
} from "@/lib/fourcutVideo";
import {
  registerGeneratedWebmDebug,
  unregisterGeneratedWebmDebug,
} from "@/lib/generatedVideoDebug";
import {
  registerGeneratedPngDebug,
  unregisterGeneratedPngDebug,
} from "@/lib/generatedImageDebug";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { shareOrCopyLink } from "@/lib/share";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useVideoConversionQuotaStore } from "@/lib/videoConversionQuotaStore";

const VIDEO_DEBUG_SCOPE = "upload-result";
const IMAGE_DEBUG_SCOPE = "upload-result-image";

type ProcessingState = "idle" | "processing" | "done" | "error";

export default function UploadResultPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    media,
    selectedIndexes,
    borderColor,
    outputFilter,
    includeVideo,
    imageResult,
    videoResult,
    setImageResult,
    setVideoResult,
    clearResults,
  } = useUploadSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
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
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isSharingVideo, setIsSharingVideo] = useState(false);
  const [hasTrimmedVideoSource, setHasTrimmedVideoSource] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugImageUrlRef = useRef<string | null>(null);
  const displayNameGenerationKeyRef = useRef<string | null>(null);
  const defaultDisplayNameRef = useRef("");
  const imageGenerationKeyRef = useRef<string | null>(null);
  const videoGenerationKeyRef = useRef<string | null>(null);
  const debugVideoUrlRef = useRef<string | null>(null);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

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

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
      return;
    }

    if (!media.length || selectedCount !== 4 || imageSources.length !== 4) {
      router.replace("/upload/select");
    }
  }, [frameId, imageSources.length, media.length, router, selectedCount]);

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
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: effectiveBorderColor,
        outputFilter,
        includeVideo,
        imageSources: imageSources.map((source) => `${source.type}:${source.src}`),
        videoSources: videoSources.map((source) => `${source.type}:${source.src}`),
      }),
    [
      effectiveBorderColor,
      frameId,
      imageSources,
      includeVideo,
      outputFilter,
      remoteFrameId,
      videoSources,
    ],
  );
  if (displayNameGenerationKeyRef.current !== generationKey) {
    displayNameGenerationKeyRef.current = generationKey;
    defaultDisplayNameRef.current = buildDefaultDisplayName(
      frameConfig?.name ?? "harucut",
      "IMAGE",
    );
  }
  const defaultDisplayName = defaultDisplayNameRef.current;

  useEffect(() => {
    setImageState(imageResult ? "done" : "idle");
    setImageNameDraft(imageResult?.displayName ?? "");
  }, [imageResult]);

  useEffect(() => {
    setVideoState(videoResult ? "done" : "idle");
    setVideoNameDraft(videoResult?.displayName ?? "");
  }, [videoResult]);

  useEffect(() => {
    let cancelled = false;

    async function inspectVideoSources() {
      if (!shouldPrepareVideo) {
        setHasTrimmedVideoSource(false);
        return;
      }

      const nextHasTrimmedVideoSource = await hasVideoSourceLongerThan(
        videoSources,
        MAX_FOURCUT_VIDEO_SECONDS,
      );

      if (!cancelled) {
        setHasTrimmedVideoSource(nextHasTrimmedVideoSource);
      }
    }

    void inspectVideoSources();

    return () => {
      cancelled = true;
    };
  }, [shouldPrepareVideo, videoSources]);

  useEffect(() => {
    if (!frameId || !layout || selectedCount !== 4 || imageSources.length !== 4) return;

    let cancelled = false;
    const currentLayout = layout;
    const imageGenerationKey = `${generationKey}:image`;
    const videoGenerationKey = `${generationKey}:video`;

    async function prepareOutputs() {
      let generatedImageInThisPass = false;

      if (!imageResult) {
        if (imageGenerationKeyRef.current === imageGenerationKey) {
          return;
        }

        imageGenerationKeyRef.current = imageGenerationKey;
        setImageError(null);
        setImageState("processing");

        try {
          const blob = await composeFramePng({
            layout: currentLayout,
            borderColor: effectiveBorderColor,
            sources: imageSources,
            outputFilter,
            theme: themeData,
            canvas: canvasRef.current ?? undefined,
          });

          const displayName = defaultDisplayName;
          if (!cancelled) {
            debugImageUrlRef.current = registerGeneratedPngDebug({
              scope: IMAGE_DEBUG_SCOPE,
              blob,
              filename: `${displayName}.png`,
              previousUrl: debugImageUrlRef.current,
            });
          }

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
            generatedImageInThisPass = true;
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) {
            setImageState("error");
            setImageError("이미지를 준비하지 못했어요. 다시 시도해 주세요.");
          }
        }
      }

      if (generatedImageInThisPass) {
        return;
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
          setVideoError("오늘 영상 변환 가능 횟수가 없어요.");
        }
        return;
      }

      if (videoGenerationKeyRef.current === videoGenerationKey) {
        return;
      }

      videoGenerationKeyRef.current = videoGenerationKey;
      setVideoError(null);
      setVideoState("processing");

      try {
        const blob = await recordFrameWebm({
          layout: currentLayout,
          borderColor: effectiveBorderColor,
          sources: videoSources,
          outputFilter,
          theme: themeData,
          seconds: MAX_FOURCUT_VIDEO_SECONDS,
          canvas: canvasRef.current ?? undefined,
        });

        const displayName = defaultDisplayName;
        const filename = `${displayName}.webm`;

        if (!cancelled) {
          debugVideoUrlRef.current = registerGeneratedWebmDebug({
            scope: VIDEO_DEBUG_SCOPE,
            blob,
            filename,
            previousUrl: debugVideoUrlRef.current,
          });
        }

        const file = new File([blob], filename, {
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
          setVideoError("영상을 준비하지 못했어요. 다시 시도해 주세요.");
        }
      }
    }

    void prepareOutputs();

    return () => {
      cancelled = true;
    };
  }, [
    consumeVideoConversion,
    defaultDisplayName,
    effectiveBorderColor,
    frameConfig?.name,
    frameId,
    generationKey,
    imageResult,
    imageSources,
    layout,
    outputFilter,
    remainingVideoConversions,
    selectedCount,
    setImageResult,
    setVideoResult,
    shouldPrepareVideo,
    themeData,
    videoResult,
    videoSources,
  ]);

  useEffect(() => {
    return () => {
      unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
      debugImageUrlRef.current = null;
      unregisterGeneratedWebmDebug(VIDEO_DEBUG_SCOPE, debugVideoUrlRef.current);
      debugVideoUrlRef.current = null;
    };
  }, []);

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
      alert("영상 이름을 저장하지 못했어요.");
    } finally {
      setIsSavingVideoName(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!imageResult) return;

    setIsDownloadingImage(true);
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(imageResult.displayName, imageResult.extension),
      );
    } catch (error) {
      console.error(error);
      alert(
        getUserFacingApiErrorMessage(error, "이미지를 다운로드하지 못했어요."),
      );
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!videoResult) return;

    setIsDownloadingVideo(true);
    try {
      const url = await getMediaDownloadUrl(videoResult.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(videoResult.displayName, videoResult.extension),
      );
    } catch (error) {
      console.error(error);
      alert(
        getUserFacingApiErrorMessage(error, "영상을 다운로드하지 못했어요."),
      );
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  const handleShareImage = async () => {
    if (!imageResult) return;

    setIsSharingImage(true);
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      const result = await shareOrCopyLink({
        title: `${imageResult.displayName} | 하루컷`,
        text: "업로드로 완성한 하루컷 이미지예요.",
        url,
      });

      if (result === "copied") {
        alert("이미지 링크를 복사했어요.");
      }
    } catch (error) {
      console.error(error);
      alert(
        getUserFacingApiErrorMessage(error, "이미지 링크를 준비하지 못했어요."),
      );
    } finally {
      setIsSharingImage(false);
    }
  };

  const handleShareVideo = async () => {
    if (!videoResult) return;

    setIsSharingVideo(true);
    try {
      const url = await getMediaDownloadUrl(videoResult.mediaId);
      const result = await shareOrCopyLink({
        title: `${videoResult.displayName} | 하루컷`,
        text: "업로드로 완성한 하루컷 영상이에요.",
        url,
      });

      if (result === "copied") {
        alert("영상 링크를 복사했어요.");
      }
    } catch (error) {
      console.error(error);
      alert(
        getUserFacingApiErrorMessage(error, "영상 링크를 준비하지 못했어요."),
      );
    } finally {
      setIsSharingVideo(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 lg:max-w-3xl">
        <PageHeader title="업로드 결과" />
        <StepProgress current={3} total={3} label="결과 확인" />

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                {isPreparing ? "결과 준비 중" : "결과 준비 완료"}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {isPreparing
                  ? "완성되면 바로 다운로드하거나 공유할 수 있어요."
                  : "마음에 드는 결과를 저장하거나 링크로 공유해 보세요."}
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-zinc-300">
              {shouldPrepareVideo ? "이미지 + 영상" : "이미지"}
            </span>
          </div>
        </section>

        {isPreparing ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
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
                  <span>영상 준비</span>
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
              ) : null}
            </div>
          </section>
        ) : null}

        {shouldPrepareVideo ? (
          <section className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-[11px] text-amber-100">
            <p>영상 결과는 최대 {MAX_FOURCUT_VIDEO_SECONDS}초로 만들어요.</p>
            {hasTrimmedVideoSource ? (
              <p className="mt-1 text-amber-50/90">{TRIMMED_VIDEO_NOTICE}</p>
            ) : null}
          </section>
        ) : null}

        <section
          className={
            shouldPrepareVideo
              ? "mx-auto grid w-full max-w-md gap-3 sm:max-w-none sm:grid-cols-2"
              : "mx-auto w-full max-w-md"
          }
        >
          <FramePreview
            frameId={frameId}
            media={previewImage}
            borderColor={effectiveBorderColor}
            outputFilter={outputFilter}
            theme={themeData}
          />

          {shouldPrepareVideo ? (
            <FramePreview
              frameId={frameId}
              media={previewVideo}
              borderColor={effectiveBorderColor}
              outputFilter={outputFilter}
              theme={themeData}
            />
          ) : null}
        </section>

        {imageError ? <p className="text-[11px] text-red-300">{imageError}</p> : null}
        {videoError ? <p className="text-[11px] text-red-300">{videoError}</p> : null}

        {imageState === "error" || videoState === "error" ? (
          <button
            type="button"
            onClick={() => {
              imageGenerationKeyRef.current = null;
              videoGenerationKeyRef.current = null;
              unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
              debugImageUrlRef.current = null;
              unregisterGeneratedWebmDebug(VIDEO_DEBUG_SCOPE, debugVideoUrlRef.current);
              debugVideoUrlRef.current = null;
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
            description="기록으로 저장될 이미지 이름을 수정할 수 있어요."
            asset={imageResult}
            metaLabel="업로드 결과 · 이미지"
            draftName={imageNameDraft}
            onChangeName={setImageNameDraft}
            onSaveName={handleSaveImageName}
            onDownload={handleDownloadImage}
            onShare={handleShareImage}
            isSavingName={isSavingImageName}
            isDownloading={isDownloadingImage}
            isSharing={isSharingImage}
          />
        ) : null}

        {videoResult ? (
          <GeneratedAssetDownloadCard
            title="영상 다운로드"
            description="영상 결과도 같은 이름 규칙으로 저장하고 바로 공유할 수 있어요."
            asset={videoResult}
            metaLabel="업로드 결과 · 영상"
            draftName={videoNameDraft}
            onChangeName={setVideoNameDraft}
            onSaveName={handleSaveVideoName}
            onDownload={handleDownloadVideo}
            onShare={handleShareVideo}
            isSavingName={isSavingVideoName}
            isDownloading={isDownloadingVideo}
            isSharing={isSharingVideo}
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
