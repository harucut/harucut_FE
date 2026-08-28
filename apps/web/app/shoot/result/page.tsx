"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratedAssetDownloadCard } from "@/components/frame/GeneratedAssetDownloadCard";
import { FramePreview, type FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import type { FrameId } from "@/constants/frames";
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
  FOURCUT_OUTPUT_EXTENSION,
} from "@/lib/fourcutOutput";
import { newIdempotencyKey } from "@/lib/composeApi";
import { describeComposeFailure } from "@/lib/fourcutCompose";
import { saveFourcutToServer } from "@/lib/fourcutProcessing";
import {
  registerGeneratedPngDebug,
  unregisterGeneratedPngDebug,
} from "@/lib/generatedImageDebug";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isNotNull } from "@/lib/guards";
import { setPendingGuestSave } from "@/lib/pendingGuestSave";
import { buildPathWithRedirect } from "@/lib/redirect";
import { nativeNotify } from "@/lib/nativeBridge";
import { shareOrCopyLink } from "@/lib/share";
import { useShootSession } from "@/lib/shootSessionStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { updateMediaDisplayName, getMediaDownloadUrl } from "@/lib/userMediaApi";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";

const IMAGE_DEBUG_SCOPE = "shoot-result-image";

// 비회원이 로그인으로 넘어갈 때 쓰는 경로. 로그인 후 /home에서 보관해 둔 결과물을 자동 저장한다.
const GUEST_LOGIN_HANDOFF_PATH = buildPathWithRedirect(
  "/login",
  "/home?resumeSave=1",
);

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
    eventName,
    source,
  } = useShootSession();
  // 갤러리에서 온 사진이면 "다시 촬영"이라고 말하면 안 된다 — 찍은 적이 없다.
  const fromUpload = source === "upload";
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const showGuestRestrictedNotice = useGuestTrialStore(
    (state) => state.showGuestRestrictedNotice,
  );
  const guestMode = accessMode === "guest";
  const [imageState, setImageState] = useState<ProcessingState>(
    imageResult ? "done" : "idle",
  );
  const [imageError, setImageError] = useState<string | null>(null);
  // 다시 시도해서 달라질 수 있는 실패인지. 없는 프레임이나 서버가 못 읽는 스티커처럼
  // 몇 번을 눌러도 같은 결과인 실패에서는 재시도 버튼을 감춘다.
  const [isImageErrorRetryable, setIsImageErrorRetryable] = useState(true);
  // 재시도 버튼이 실제로 다시 돌게 하는 값.
  // 실패했을 때 imageResult 는 이미 null 이라, 이 값을 안 바꾸면 아래 effect 의
  // 의존성이 하나도 안 변해 effect 가 다시 돌지 않는다 — 버튼을 눌러도 "대기 중"에서 멈췄다.
  const [retryNonce, setRetryNonce] = useState(0);
  const [imageNameDraft, setImageNameDraft] = useState(imageResult?.displayName ?? "");
  const [isSavingImageName, setIsSavingImageName] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isHandingOffToLogin, setIsHandingOffToLogin] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debugImageUrlRef = useRef<string | null>(null);
  const guestImageUrlRef = useRef<string | null>(null);
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
    () => selectedShots.map((photo): FrameMedia | null => (photo ? { src: photo } : null)),
    [selectedShots],
  );
  const imageSources: FrameSource[] = useMemo(
    () =>
      selectedShots
        .map((photo) => (photo ? { src: photo } : null))
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

  // 고른 색이 곧 저장본의 색이다 — 회원 경로는 이 값을 합성 요청에 실어 보내고,
  // 비회원 경로는 브라우저가 이 색으로 그린다. 꾸민 프레임이면 프레임에 저장된 배경이
  // 우선한다(resolveFrameBackgroundColor 가 themeData 를 먼저 본다).
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);
  const layout = frameId ? FRAME_LAYOUTS[frameId as FrameId] : null;
  /*
    "이 입력으로 한 번만 만든다"를 가리키는 키.

    색이 다시 들어와 있다 — 이제 **회원 경로에서도 색이 결과를 바꾼다**
    (`ComposeRequest.backgroundColor`). 서버는 같은 멱등키로 색만 바꿔 보내면 기존 작업을
    그대로 재생하므로, 색이 키에 없으면 사용자가 색을 바꿔도 예전 그림이 그대로 나온다.

    예전에 색을 뺐던 이유는 사라졌다. 그때는 `useServerFrameBackground` 가 서버 배경을
    **나중에** 읽어 와 색이 저절로 한 번 바뀌었고, 그래서 합성이 두 번 돌아 보관함에 같은
    네컷이 두 벌 남았다(2026-08-24). 그 조회를 걷어냈으니 색은 사용자가 바꿀 때만 바뀐다.
  */
  const generationKey = useMemo(
    () =>
      JSON.stringify({
        frameId,
        remoteFrameId,
        borderColor: effectiveBorderColor,
        outputFilter,
        imageSources: imageSources.map((source) => source.src),
        retryNonce,
      }),
    [
      effectiveBorderColor,
      frameId,
      imageSources,
      outputFilter,
      remoteFrameId,
      retryNonce,
    ],
  );

  // 합성 재시도는 같은 멱등키로 보낸다 — 서버가 기존 작업을 그대로 돌려줘 두 번 그리지 않는다.
  // 입력이 바뀌면(다른 필터·다른 사진) 새 시도이므로 키도 새로 잡는다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const idempotencyKey = useMemo(() => newIdempotencyKey(), [generationKey]);

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
      if (imageResult) return;
      if (imageGenerationKeyRef.current === imageGenerationKey) return;

      imageGenerationKeyRef.current = imageGenerationKey;
      setImageError(null);
      setIsImageErrorRetryable(true);
      setImageState("processing");

      const displayName = defaultDisplayName;

      try {
        if (guestMode) {
          // 비회원은 보관함을 쓸 수 없어서, 브라우저가 그린 그림이 곧 결과물이다.
          const blob = await composeFramePng({
            layout: currentLayout,
            borderColor: effectiveBorderColor,
            sources: imageSources,
            outputFilter,
            theme: themeData,
            canvas: canvasRef.current ?? undefined,
          });

          if (cancelled) return;

          debugImageUrlRef.current = registerGeneratedPngDebug({
            scope: IMAGE_DEBUG_SCOPE,
            blob,
            filename: `${displayName}.png`,
            previousUrl: debugImageUrlRef.current,
          });

          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          if (guestImageUrlRef.current?.startsWith("blob:")) {
            URL.revokeObjectURL(guestImageUrlRef.current);
          }

          guestImageUrlRef.current = objectUrl;
          setImageResult({
            mediaId: -1,
            objectUrl,
            downloadUrl: objectUrl,
            displayName,
          });
          setImageState("done");
          return;
        }

        // 로그인 사용자는 **서버가 그린다.** 화면 미리보기는 아래 <FramePreview> 가
        // DOM 으로 그리므로 여기서 캔버스 합성을 할 이유가 없다.
        //
        // 예전에는 회원 경로에서도 위 composeFramePng 을 먼저 돌렸는데, 그 결과를 쓰는 곳이
        // 개발자용 디버그 전역 하나뿐이었다. 최대 16MP 캔버스 합성과 PNG 인코딩을 매번
        // 헛돌리며 서버 합성 시작을 그만큼 늦췄고, 더 나쁘게는 그 로컬 합성이 실패하면
        // 멀쩡히 성공했을 서버 저장까지 통째로 취소됐다.
        const asset = await saveFourcutToServer({
          sources: imageSources.map((source) => source.src),
          layout: currentLayout,
          outputFilter,
          frameId: frameId as FrameId,
          remoteFrameId,
          displayName,
          idempotencyKey,
          backgroundColor: effectiveBorderColor,
        });

        if (!cancelled) {
          setImageResult(asset);
          setImageState("done");
          // 서버 합성은 최대 90초까지 간다(lib/composeApi.ts). 그동안 앱을 벗어난 사람은
          // 끝난 걸 알 방법이 없다 — 화면이 안 보일 때만 알린다. 보고 있으면 그냥 보인다.
          if (document.visibilityState === "hidden") {
            void nativeNotify({
              title: "네컷이 완성됐어요",
              body: "눌러서 보러 가기",
            });
          }
        }
      } catch (error) {
        console.error(error);
        if (cancelled) return;

        // 실패 사유를 버리지 않는다. 프레임을 바꾸면 되는 실패인지, 기다리면 되는 실패인지
        // 사용자가 알아야 한다(lib/fourcutCompose.ts describeComposeFailure).
        const failure = describeComposeFailure(error);
        setImageState("error");
        setImageError(failure.message);
        setIsImageErrorRetryable(failure.retryable);
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
    idempotencyKey,
    remoteFrameId,
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

  // 비회원 결과물은 메모리 blob이라 새로고침·이탈 한 번에 사라진다. 최소한 경고를 띄운다.
  useUnsavedWorkGuard(guestMode && Boolean(imageResult));

  if (!frameId || !layout) return null;

  const isPreparing = imageState === "processing" || imageState === "idle";

  const syncDisplayName = async (
    asset: NonNullable<typeof imageResult>,
    nextName: string,
    updateAsset: (displayName: string) => void,
  ) => {
    const sanitizedName = sanitizeDisplayName(nextName, asset.displayName);
    const updated = await updateMediaDisplayName(asset.mediaId, sanitizedName);
    const resolvedName = updated.displayName?.trim() || sanitizedName;

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

  /**
   * 로그인 뒤 다시 만들 수 있도록 재료를 보관한다.
   *
   * 완성본이 아니라 원본 4장을 담는다 — 완성본을 등록하는 API 가 없어졌고, 재료가 더 작다.
   * 로그인을 마치면 GuestTrialBridge 가 이걸로 서버 합성을 돌린다.
   */
  const storeGuestHandoff = () => {
    if (!frameId) return false;

    return setPendingGuestSave(
      {
        sources: imageSources.map((source) => source.src),
        frameId: frameId as FrameId,
        remoteFrameId,
        outputFilter,
        // 사용자가 결과 화면에서 이름을 고쳤으면 그 이름으로 남긴다.
        // 기본값을 쓰면 공들여 붙인 이름이 로그인 직후 조용히 사라진다.
        displayName: imageResult?.displayName?.trim() || defaultDisplayName,
      },
      Date.now(),
    );
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
        // 앱 셸 안에서는 네이티브가 사진첩에 넣는다 — 끝날 때까지 기다려야 실패를 잡는다.
        await downloadBlob(
          blob,
          buildDownloadFilename(imageResult.displayName, FOURCUT_OUTPUT_EXTENSION),
        );
        // 로그인으로 이어 가도 다시 만들 수 있도록 **원본 4장과 만드는 방법**을 보관한다.
        // 완성본이 아니라 재료를 담는 이유는 lib/pendingGuestSave.ts 주석 참고.
        const stored = storeGuestHandoff();
        showGuestSavedNotice(
          stored ? { loginHref: GUEST_LOGIN_HANDOFF_PATH } : undefined,
        );
        return;
      }

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

  // 비회원이 로그인으로 이동할 때 결과물을 보관한다. OAuth는 전체 페이지 리다이렉트라
  // 메모리 blob URL로는 전부 유실되므로, 로그인 전에 localStorage로 옮겨 둔다.
  const handleGuestLogin = async () => {
    if (!imageResult) {
      router.push(GUEST_LOGIN_HANDOFF_PATH);
      return;
    }

    setIsHandingOffToLogin(true);
    try {
      const stored = storeGuestHandoff();
      if (!stored) {
        showStatusNotice(
          "결과를 보관하지 못했어요",
          "결과가 너무 커서 잠시 보관하지 못했어요. 먼저 이미지를 내려받아 주세요.",
        );
        return;
      }
    } catch (error) {
      console.error(error);
      showStatusNotice(
        "결과를 보관하지 못했어요",
        "로그인 중에 결과가 사라질 수 있어요. 먼저 이미지를 내려받아 주세요.",
      );
      return;
    } finally {
      setIsHandingOffToLogin(false);
    }

    router.push(GUEST_LOGIN_HANDOFF_PATH);
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
        showStatusNotice(
          "링크를 복사했어요",
          "하루 동안 열리는 이미지 링크예요. 바로 붙여넣어 공유할 수 있어요.",
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
          title={fromUpload ? "네컷 결과" : "촬영 결과"}
          description={
            guestMode
              ? "비회원 체험 결과 이미지를 내려받고, 이어서 로그인해 기능을 확장해 보세요."
              : "완성된 하루컷 결과를 저장하거나 링크로 공유해 보세요."
          }
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

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
                    ? "지금은 이미지 저장까지 해볼 수 있고, 기록 보관부터는 로그인 후 이용할 수 있어요."
                    : "마음에 드는 결과를 저장하거나 링크로 공유해 보세요."}
              </p>
            </div>
            <span className="rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-strong)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--hc-primary-strong)]">
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

        {imageError ? <p className="text-[11px] text-[color:var(--hc-danger)]">{imageError}</p> : null}

        {imageState === "error" && isImageErrorRetryable ? (
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
              // 실패했을 때 imageResult 는 이미 null 이라 clearResults() 만으로는
              // effect 의존성이 하나도 안 바뀐다. 이 값을 올려야 실제로 다시 돈다.
              setRetryNonce((nonce) => nonce + 1);
            }}
            className="hc-button-secondary rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            다시 준비하기
          </button>
        ) : null}

        {imageState === "error" && !isImageErrorRetryable ? (
          <Link
            // 업로드로 왔으면 업로드 쪽 프레임 고르기로 돌아간다. 그냥 /shoot 으로 보내면
            // 다음이 카메라라, 갤러리로 만들던 사람이 촬영 화면에 떨어진다.
            href={fromUpload ? "/shoot?source=upload" : "/shoot"}
            className="hc-button-secondary inline-flex w-fit rounded-full border px-4 py-2 text-xs font-semibold transition"
          >
            프레임 다시 고르기
          </Link>
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
                지금은 사진 촬영과 이미지 저장을 해볼 수 있어요. 링크 공유, 기록 보관,
                프레임 만들기는 로그인 후에 이용할 수 있어요.
              </p>
              <p className="text-[12px] leading-6 text-[color:var(--hc-muted)]">
                체험 결과는 이 화면을 벗어나면 사라져요. 먼저 이미지를 내려받거나
                &ldquo;로그인하고 저장하기&rdquo;로 이어 가 주세요.
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
              {/* 버튼을 감춰 버리면 체험하는 사람이 "가입하면 뭐가 더 되는지"를 못 본다.
                  그래서 회원 기능도 자리를 남기고 같은 방식으로 안내한다. */}
              <button
                type="button"
                onClick={showGuestRestrictedNotice}
                className="hc-button-secondary rounded-full border px-4 py-3 text-sm font-semibold transition"
              >
                기록 보관은 로그인 후에 이용할 수 있어요
              </button>
              <button
                type="button"
                onClick={showGuestShareNotice}
                className="hc-button-secondary rounded-full border px-4 py-3 text-sm font-semibold transition"
              >
                링크 공유는 로그인 후에 이용할 수 있어요
              </button>
            </div>
          </section>
        ) : null}

        <div className="flex gap-2">
          <Link
            href={
              guestMode
                ? fromUpload
                  ? "/shoot/upload"
                  : "/shoot/capture"
                : "/shoot/select"
            }
            className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
          >
            {guestMode && !fromUpload ? "다시 촬영하기" : "사진 다시 고르기"}
          </Link>
          {guestMode ? (
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={isHandingOffToLogin}
              className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition disabled:opacity-40"
            >
              {isHandingOffToLogin ? "결과 보관 중..." : "로그인하고 저장하기"}
            </button>
          ) : (
            <Link
              href="/home"
              className="hc-button-secondary flex-1 rounded-full border px-4 py-2 text-center text-xs font-semibold transition"
            >
              홈으로 가기
            </Link>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
