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
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isNotNull } from "@/lib/guards";
import { shareOrCopyLink } from "@/lib/share";
import { useShootSession } from "@/lib/shootSessionStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useDecorateSession } from "@/lib/decorateSessionStore";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";

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
    imageResult,
    setImageResult,
    clearResults,
  } = useShootSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const guestMode = accessMode === "guest";
  const setDecorateSource = useDecorateSession((state) => state.setSource);

  // 완성된 네컷을 꾸미기 에디터로 넘긴다. 캔버스 오염(taint) 방지를 위해
  // 가능하면 이미지를 blob으로 받아 same-origin object URL로 전달한다.
  const handleDecorate = async () => {
    if (!imageResult) return;
    try {
      const url = guestMode
        ? imageResult.objectUrl
        : await getMediaDownloadUrl(imageResult.mediaId);
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
  const guestImageUrlRef = useRef<string | null>(null);
  const displayNameGenerationKeyRef = useRef<string | null>(null);
  const defaultDisplayNameRef = useRef("");
  const imageGenerationKeyRef = useRef<string | null>(null);

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
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedShots
        .map((shot) => (shot ? ({ type: "image", src: shot.photo } as const) : null))
        .filter(isNotNull),
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
    guestMode,
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
              {guestMode ? "이미지 다운로드" : "이미지"}
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

        {imageError ? <p className="text-[11px] text-red-500">{imageError}</p> : null}

        {imageState === "error" ? (
          <button
            type="button"
            onClick={() => {
              imageGenerationKeyRef.current = null;
              unregisterGeneratedPngDebug(IMAGE_DEBUG_SCOPE, debugImageUrlRef.current);
              debugImageUrlRef.current = null;
              if (guestImageUrlRef.current?.startsWith("blob:")) {
                URL.revokeObjectURL(guestImageUrlRef.current);
              }
              guestImageUrlRef.current = null;
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
