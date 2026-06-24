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
  downloadBlob,
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
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isNotNull } from "@/lib/guards";
import { shareOrCopyLink } from "@/lib/share";
import { useShootSession } from "@/lib/shootSessionStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import {
  useHydrateVideoConversionQuota,
  useVideoConversionQuotaStore,
} from "@/lib/videoConversionQuotaStore";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";

const VIDEO_DEBUG_SCOPE = "shoot-result";
const IMAGE_DEBUG_SCOPE = "shoot-result-image";

type ProcessingState = "idle" | "processing" | "done" | "error";

export default function ShootResultPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    includeVideo,
    imageResult,
    videoResult,
    setImageResult,
    setVideoResult,
    clearResults,
  } = useShootSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const guestMode = accessMode === "guest";
  const consumeVideoConversion = useVideoConversionQuotaStore((state) => state.consume);
  const usedVideoConversions = useVideoConversionQuotaStore((state) => state.usedCount);
  const videoConversionLimit = useVideoConversionQuotaStore((state) => state.limit);
  const videoConversionUnlimited = useVideoConversionQuotaStore(
    (state) => state.unlimited,
  );
  useHydrateVideoConversionQuota(!guestMode);

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
  const debugVideoUrlRef = useRef<string | null>(null);
  const guestImageUrlRef = useRef<string | null>(null);
  const displayNameGenerationKeyRef = useRef<string | null>(null);
  const defaultDisplayNameRef = useRef("");
  const imageGenerationKeyRef = useRef<string | null>(null);
  const videoGenerationKeyRef = useRef<string | null>(null);

  const showStatusNotice = (title: string, message: string) => {
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: guestMode ? "GUEST MODE" : "NOTICE",
      icon: guestMode ? "lock" : "sparkles",
      message,
      title,
    });
  };

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

  const selectedShots = useMemo(
    () => selectedIndexes.map((index) => (index == null ? null : shots[index] ?? null)),
    [selectedIndexes, shots],
  );
  const previewImage = useMemo(
    () =>
      selectedShots.map((shot): FrameMedia | null =>
        shot ? { type: "image", src: shot.photo } : null,
      ),
    [selectedShots],
  );
  const previewVideo = useMemo(
    () =>
      selectedShots.map((shot): FrameMedia | null => {
        if (!shot) return null;
        if (shot.video) return { type: "video", src: shot.video };
        return { type: "image", src: shot.photo };
      }),
    [selectedShots],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedShots
        .map((shot) => (shot ? ({ type: "image", src: shot.photo } as const) : null))
        .filter(isNotNull),
    [selectedShots],
  );
  const videoSources: FrameSource[] = useMemo(
    () =>
      selectedShots
        .map((shot) => {
          if (!shot) return null;
          if (shot.video) return { type: "video", src: shot.video } as const;
          return { type: "image", src: shot.photo } as const;
        })
        .filter((value): value is FrameSource => Boolean(value)),
    [selectedShots],
  );

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }

    if (!shots.length || selectedCount !== 4 || imageSources.length !== 4) {
      router.replace("/shoot/select");
    }
  }, [frameId, imageSources.length, router, selectedCount, shots.length]);

  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);
  const layout = frameId ? FRAME_LAYOUTS[frameId as FrameId] : null;
  const frameConfig = FRAME_CONFIGS.find((frame) => frame.id === frameId);
  const videoEligible = useMemo(
    () => selectedShots.some((shot) => Boolean(shot?.video)),
    [selectedShots],
  );
  const shouldPrepareVideo = !guestMode && includeVideo && videoEligible;
  const remainingVideoConversions = videoConversionUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(videoConversionLimit - usedVideoConversions, 0);
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: effectiveBorderColor,
        outputFilter,
        includeVideo: shouldPrepareVideo,
        imageSources: imageSources.map((source) => `${source.type}:${source.src}`),
        videoSources: videoSources.map((source) => `${source.type}:${source.src}`),
      }),
    [
      effectiveBorderColor,
      frameId,
      imageSources,
      outputFilter,
      remoteFrameId,
      shouldPrepareVideo,
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

          if (guestMode) {
            const objectUrl = URL.createObjectURL(blob);
            if (!cancelled) {
              if (guestImageUrlRef.current?.startsWith("blob:")) {
                URL.revokeObjectURL(guestImageUrlRef.current);
              }

              guestImageUrlRef.current = objectUrl;
              setImageResult({
                mediaId: -1,
                kind: "IMAGE",
                objectUrl,
                downloadUrl: objectUrl,
                extension: "png",
                displayName,
              });
              setImageState("done");
              generatedImageInThisPass = true;
            } else {
              URL.revokeObjectURL(objectUrl);
            }
          } else {
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
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) {
            setImageState("error");
            setImageError("이미지를 준비하지 못했어요. 다시 시도해 주세요.");
          }
        }
      }

      if (generatedImageInThisPass || guestMode) {
        if (!cancelled) {
          setVideoState("idle");
          setVideoError(null);
        }
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
    frameId,
    generationKey,
    guestMode,
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
    const resolvedName = updated.displayName?.trim() || updated.displayname?.trim() || sanitizedName;

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

      if (guestMode) {
        setImageResult({ ...imageResult, displayName: nextName });
        setImageNameDraft(nextName);
        return;
      }

      const resolvedName = await syncDisplayName(imageResult, imageNameDraft, (displayName) =>
        setImageResult({ ...imageResult, displayName }),
      );
      setImageNameDraft(resolvedName);
    } catch (error) {
      console.error(error);
      showStatusNotice("이름을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
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
      showStatusNotice("영상 이름을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
    } finally {
      setIsSavingVideoName(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!imageResult) return;

    setIsDownloadingImage(true);
    try {
      if (guestMode) {
        const response = await fetch(imageResult.downloadUrl ?? imageResult.objectUrl);
        if (!response.ok) {
          throw new Error(`guest download failed: ${response.status}`);
        }

        const blob = await response.blob();
        downloadBlob(
          blob,
          buildDownloadFilename(imageResult.displayName, imageResult.extension),
        );
        showGuestSavedNotice();
        return;
      }

      const url = await getMediaDownloadUrl(imageResult.mediaId);
      await downloadFromUrl(
        url,
        buildDownloadFilename(imageResult.displayName, imageResult.extension),
      );
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "이미지를 다운로드하지 못했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
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
      showStatusNotice(
        "영상을 다운로드하지 못했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
      );
    } finally {
      setIsDownloadingVideo(false);
    }
  };

  const handleShareImage = async () => {
    if (!imageResult) return;

    if (guestMode) {
      showGuestShareNotice();
      return;
    }

    setIsSharingImage(true);
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      const result = await shareOrCopyLink({
        title: `${imageResult.displayName} | 하루컷`,
        text: "방금 완성한 하루컷 이미지예요.",
        url,
      });

      if (result === "copied") {
        showStatusNotice("링크를 복사했어요", "이미지 링크를 바로 붙여넣어 공유할 수 있어요.");
      }
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "이미지 링크를 준비하지 못했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
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
        text: "방금 완성한 하루컷 영상이에요.",
        url,
      });

      if (result === "copied") {
        showStatusNotice("링크를 복사했어요", "영상 링크를 바로 붙여넣어 공유할 수 있어요.");
      }
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "영상 링크를 준비하지 못했어요",
        getUserFacingApiErrorMessage(error, "잠시 후 다시 시도해 주세요."),
      );
    } finally {
      setIsSharingVideo(false);
    }
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 lg:max-w-3xl">
        <PageHeader
          title="촬영 결과"
          brandHref={guestMode ? "/shoot" : "/home"}
          description={
            guestMode
              ? "비회원 체험 결과 이미지를 내려받고, 이어서 로그인해 기능을 확장해 보세요."
              : "완성된 하루컷 결과를 저장하거나 링크로 공유해 보세요."
          }
        />
        <StepProgress current={4} total={4} label="결과 확인" />

        <section className="rounded-[28px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 shadow-[0_18px_40px_rgba(30,215,96,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--hc-text)]">
                {isPreparing ? "결과 준비 중" : "결과 준비 완료"}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--hc-muted)]">
                {isPreparing
                  ? guestMode
                    ? "완성되면 이미지를 바로 다운로드할 수 있어요."
                    : "완성되면 바로 다운로드하거나 공유할 수 있어요."
                  : guestMode
                    ? "지금은 이미지 다운로드만 가능하고, 링크 공유와 기록 저장은 로그인 후 이용할 수 있어요."
                    : "마음에 드는 결과를 저장하거나 링크로 공유해 보세요."}
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--hc-primary-strong)]">
              {guestMode ? "이미지 다운로드" : shouldPrepareVideo ? "이미지 + 영상" : "이미지"}
            </span>
          </div>
        </section>

        {isPreparing ? (
          <section className="rounded-[28px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 shadow-[0_18px_40px_rgba(30,215,96,0.08)]">
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2">
                <span className="text-[color:var(--hc-text)]">이미지 준비</span>
                <span className="text-[color:var(--hc-muted)]">
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
                <div className="flex items-center justify-between rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2">
                  <span className="text-[color:var(--hc-text)]">영상 준비</span>
                  <span className="text-[color:var(--hc-muted)]">
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
          <section className="rounded-[28px] border border-[rgba(30,215,96,0.18)] bg-[rgba(30,215,96,0.08)] px-4 py-3 text-[11px] text-[color:var(--hc-primary-strong)]">
            <p>영상 결과는 최대 {MAX_FOURCUT_VIDEO_SECONDS}초로 만들어요.</p>
            {hasTrimmedVideoSource ? (
              <p className="mt-1 text-[color:var(--hc-text)]/80">{TRIMMED_VIDEO_NOTICE}</p>
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

        {imageError ? <p className="text-[11px] text-red-500">{imageError}</p> : null}
        {videoError ? <p className="text-[11px] text-red-500">{videoError}</p> : null}

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
              if (guestImageUrlRef.current?.startsWith("blob:")) {
                URL.revokeObjectURL(guestImageUrlRef.current);
              }
              guestImageUrlRef.current = null;
              clearResults();
              setImageState("idle");
              setVideoState("idle");
              setImageError(null);
              setVideoError(null);
            }}
            className="hc-button-secondary rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            다시 준비하기
          </button>
        ) : null}

        {imageResult ? (
          <GeneratedAssetDownloadCard
            title="이미지 다운로드"
            description={
              guestMode
                ? "파일 이름을 다듬고 체험 결과 이미지를 바로 내려받을 수 있어요."
                : "기록으로 저장될 파일 이름을 수정하고 이미지를 내려받을 수 있어요."
            }
            asset={imageResult}
            metaLabel={guestMode ? "비회원 체험 · 이미지" : "촬영 결과 · 이미지"}
            draftName={imageNameDraft}
            onChangeName={setImageNameDraft}
            onSaveName={handleSaveImageName}
            onDownload={handleDownloadImage}
            onShare={guestMode ? undefined : handleShareImage}
            isSavingName={isSavingImageName}
            isDownloading={isDownloadingImage}
            isSharing={isSharingImage}
          />
        ) : null}

        {guestMode && imageResult ? (
          <section className="hc-surface-hero rounded-[28px] border p-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[color:var(--hc-text)]">
                비회원 체험 결과 안내
              </p>
              <p className="text-[12px] leading-6 text-[color:var(--hc-muted)]">
                지금은 이미지를 기기에 저장할 수 있고, 링크 공유, 기록 저장, 업로드 시작,
                프레임 꾸미기 같은 서버 연동 기능은 로그인 후에 이용할 수 있어요.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isDownloadingImage}
                className="hc-button-primary rounded-full px-4 py-3 text-sm font-semibold transition disabled:opacity-40"
              >
                {isDownloadingImage ? "이미지 저장 중..." : "이미지 다운로드"}
              </button>
              <button
                type="button"
                onClick={showGuestShareNotice}
                className="hc-button-secondary rounded-full border px-4 py-3 text-sm font-semibold transition"
              >
                링크 공유는 로그인 후 가능해요
              </button>
            </div>
          </section>
        ) : null}

        {videoResult ? (
          <GeneratedAssetDownloadCard
            title="영상 다운로드"
            description="영상 결과도 같은 이름 규칙으로 저장하고 바로 공유할 수 있어요."
            asset={videoResult}
            metaLabel="촬영 결과 · 영상"
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
            href={guestMode ? "/shoot/capture" : "/shoot/select"}
            className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
          >
            {guestMode ? "다시 촬영하기" : "사진 다시 고르기"}
          </Link>
          <Link
            href={guestMode ? "/login" : "/home"}
            className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
          >
            {guestMode ? "로그인으로 이동" : "홈으로 가기"}
          </Link>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
