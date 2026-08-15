"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratedAssetDownloadCard } from "@/components/frame/GeneratedAssetDownloadCard";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import type { FrameId } from "@/constants/frames";
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
  FOURCUT_OUTPUT_EXTENSION,
} from "@/lib/fourcutOutput";
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import {
  registerGeneratedPngDebug,
  unregisterGeneratedPngDebug,
} from "@/lib/generatedImageDebug";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
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
  const setNotice = useGuestTrialStore((state) => state.setNotice);

  // 촬영 결과 화면과 같은 전역 안내 오버레이를 쓴다(브라우저 alert 사용 안 함).
  const showStatusNotice = (title: string, message: string) => {
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: "NOTICE",
      icon: "sparkles",
      message,
      title,
    });
  };

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
    () => selectedMedia.map((item): FrameMedia | null => (item ? { src: item.src } : null)),
    [selectedMedia],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedMedia
        .map((item) => (item ? { src: item.src } : null))
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
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: effectiveBorderColor,
        outputFilter,
        imageSources: imageSources.map((source) => source.src),
      }),
    [
      effectiveBorderColor,
      frameId,
      imageSources,
      outputFilter,
      remoteFrameId,
    ],
  );
  // 합성 입력(generationKey)이 바뀔 때마다 기본 파일명을 새로 만든다.
  // buildDefaultDisplayName()은 시각 기반이라 인자가 없고, 호출할 때마다 값이 달라진다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultDisplayName = useMemo(() => buildDefaultDisplayName(), [generationKey]);

  // 합성 결과가 바뀌면 상태를 렌더 중에 맞춘다(effect로 하면 렌더가 한 번 더 돈다).
  const [syncedImageResult, setSyncedImageResult] = useState(imageResult);
  if (syncedImageResult !== imageResult) {
    setSyncedImageResult(imageResult);
    setImageState(imageResult ? "done" : "idle");
    setImageNameDraft(imageResult?.displayName ?? "");
  }

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
          const asset = await uploadGeneratedFourcutFile({ file, displayName });

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
      showStatusNotice("이름을 저장하지 못했어요", "잠시 후 다시 시도해 주세요.");
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
        buildDownloadFilename(imageResult.displayName, FOURCUT_OUTPUT_EXTENSION),
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
        showStatusNotice(
          "링크를 복사했어요",
          "이미지 링크를 바로 붙여넣어 공유할 수 있어요.",
        );
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

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)] lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 lg:max-w-3xl">
        <PageHeader
          title="업로드 결과"
          backHref="/upload/select"
          backLabel="사진 다시 고르기"
          description="완성된 하루컷 결과를 저장하거나 링크로 공유해 보세요."
        />

        <section className="rounded-[28px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 shadow-[0_18px_40px_rgba(30,215,96,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--hc-text)]">
                {isPreparing ? "결과 준비 중" : "결과 준비 완료"}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--hc-muted)]">
                {isPreparing
                  ? "완성되면 바로 다운로드하거나 공유할 수 있어요."
                  : "마음에 드는 결과를 저장하거나 링크로 공유해 보세요."}
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-2.5 py-1 text-[10px] font-medium text-[color:var(--hc-primary-strong)]">
              이미지
            </span>
          </div>
        </section>

        {isPreparing ? (
          <section className="rounded-[28px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4 shadow-[0_18px_40px_rgba(30,215,96,0.08)]">
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-3 py-2">
                <span className="text-[color:var(--hc-text)]">이미지 준비</span>
                <span className="text-[color:var(--hc-muted)]">
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

        {imageError ? <p className="text-[11px] text-[color:var(--hc-danger)]">{imageError}</p> : null}

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
            className="hc-button-secondary rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            다시 준비하기
          </button>
        ) : null}

        {imageResult ? (
          <GeneratedAssetDownloadCard
            title="이미지 다운로드"
            description="기록으로 저장될 파일 이름을 수정하고 이미지를 내려받을 수 있어요."
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
            className="hc-button-secondary rounded-full border px-4 py-2.5 text-center text-sm font-semibold transition"
          >
            네컷 꾸미기 — 스티커·텍스트·그리기
          </button>
        ) : null}

        <div className="flex gap-2">
          <Link
            href="/upload/select"
            className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
          >
            사진 다시 고르기
          </Link>
          <Link
            href="/home"
            className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
          >
            홈으로 가기
          </Link>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
