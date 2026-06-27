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
  type FrameSource,
} from "@/lib/canvas/composeFrame";
import {
  buildDefaultDisplayName,
  buildDownloadFilename,
  sanitizeDisplayName,
} from "@/lib/fourcutOutput";
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import {
  registerGeneratedPngDebug,
  unregisterGeneratedPngDebug,
} from "@/lib/generatedImageDebug";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { shareOrCopyLink } from "@/lib/share";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useDecorateSession } from "@/lib/decorateSessionStore";

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
    imageResult,
    setImageResult,
    clearResults,
  } = useUploadSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const setDecorateSource = useDecorateSession((state) => state.setSource);

  // 완성된 네컷을 꾸미기 에디터로 넘긴다(가능하면 blob으로 받아 캔버스 오염 방지).
  const handleDecorate = async () => {
    if (!imageResult) return;
    try {
      const url = await getMediaDownloadUrl(imageResult.mediaId);
      let src = url;
      try {
        const res = await fetch(url);
        if (res.ok) src = URL.createObjectURL(await res.blob());
      } catch {
        // CORS/네트워크 실패 시 원본 URL로 진행한다.
      }
      setDecorateSource(src, imageResult.displayName);
      router.push("/decorate");
    } catch (error) {
      console.error(error);
      setDecorateSource(imageResult.objectUrl, imageResult.displayName);
      router.push("/decorate");
    }
  };

  const [imageState, setImageState] = useState<ProcessingState>(
    imageResult ? "done" : "idle",
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageNameDraft, setImageNameDraft] = useState(imageResult?.displayName ?? "");
  const [isSavingImageName, setIsSavingImageName] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugImageUrlRef = useRef<string | null>(null);
  const displayNameGenerationKeyRef = useRef<string | null>(null);
  const defaultDisplayNameRef = useRef("");
  const imageGenerationKeyRef = useRef<string | null>(null);

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
        return { type: "image", src: item.src };
      }),
    [selectedMedia],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedMedia
        .map((item) => {
          if (!item) return null;
          return { type: "image", src: item.src } as const;
        })
        .filter((value): value is FrameSource => Boolean(value)),
    [selectedMedia],
  );

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
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: effectiveBorderColor,
        outputFilter,
        imageSources: imageSources.map((source) => `${source.type}:${source.src}`),
      }),
    [
      effectiveBorderColor,
      frameId,
      imageSources,
      outputFilter,
      remoteFrameId,
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
    if (!frameId || !layout || selectedCount !== 4 || imageSources.length !== 4) return;

    let cancelled = false;
    const currentLayout = layout;
    const imageGenerationKey = `${generationKey}:image`;

    async function prepareOutputs() {
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
          }
        } catch (error) {
          console.error(error);
          if (!cancelled) {
            setImageState("error");
            setImageError("이미지를 준비하지 못했어요. 다시 시도해 주세요.");
          }
        }
      }
    }

    void prepareOutputs();

    return () => {
      cancelled = true;
    };
  }, [
    defaultDisplayName,
    effectiveBorderColor,
    frameConfig?.name,
    frameId,
    generationKey,
    imageResult,
    imageSources,
    layout,
    outputFilter,
    selectedCount,
    setImageResult,
    themeData,
  ]);

  useEffect(() => {
    return () => {
      unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
      debugImageUrlRef.current = null;
    };
  }, []);

  if (!frameId || !layout) return null;

  const isPreparing = imageState === "processing" || imageState === "idle";

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
              이미지
            </span>
          </div>
        </section>

        {isPreparing ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <span>이미지 준비</span>
                <span className="text-zinc-400">
                  {imageState === "processing" ? "생성 중..." : "대기 중"}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="mx-auto w-full max-w-md">
          <FramePreview
            frameId={frameId}
            media={previewImage}
            borderColor={effectiveBorderColor}
            outputFilter={outputFilter}
            theme={themeData}
          />
        </section>

        {imageError ? <p className="text-[11px] text-red-300">{imageError}</p> : null}

        {imageState === "error" ? (
          <button
            type="button"
            onClick={() => {
              imageGenerationKeyRef.current = null;
              unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
              debugImageUrlRef.current = null;
              clearResults();
              setImageState("idle");
              setImageError(null);
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

        {imageResult ? (
          <button
            type="button"
            onClick={handleDecorate}
            className="rounded-full border border-zinc-700 px-4 py-2.5 text-center text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-900"
          >
            네컷 꾸미기 — 스티커·텍스트·그리기
          </button>
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
