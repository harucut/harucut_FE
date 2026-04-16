"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import type { FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import {
  SUPPORTED_FOURCUT_ACCEPT,
  uploadFourcutMedia,
} from "@/lib/presignedUploadApi";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { useVideoConversionQuotaStore } from "@/lib/videoConversionQuotaStore";

export default function UploadSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    media,
    selectedIndexes,
    borderColor,
    outputFilter,
    includeVideo,
    toggleSelect,
    resetAll,
    addMedia,
    setBorderColor,
    setOutputFilter,
    setIncludeVideo,
  } = useUploadSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const usedVideoConversions = useVideoConversionQuotaStore((state) => state.usedCount);
  const videoConversionLimit = useVideoConversionQuotaStore((state) => state.limit);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
    }
  }, [frameId, router]);

  const hasCustomFrame = Boolean(themeData);
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);

  const selectedMedia = useMemo(
    () => selectedIndexes.map((index) => (index == null ? null : media[index] ?? null)),
    [media, selectedIndexes],
  );
  const videoEligible = useMemo(
    () => selectedMedia.some((item) => item?.type === "video"),
    [selectedMedia],
  );
  const remainingVideoConversions = Math.max(
    videoConversionLimit - usedVideoConversions,
    0,
  );

  useEffect(() => {
    if ((!videoEligible || remainingVideoConversions === 0) && includeVideo) {
      setIncludeVideo(false);
    }
  }, [includeVideo, remainingVideoConversions, setIncludeVideo, videoEligible]);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleChangeFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) return;

    setUploadError(null);
    setIsUploadingFiles(true);

    const uploadResults = await Promise.allSettled(
      files.map(async (file) => {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          throw new Error(`Unsupported upload file type: ${file.type || file.name}`);
        }

        const uploaded = await uploadFourcutMedia(file);

        return {
          type: file.type.startsWith("video/") ? "video" : "image",
          src: uploaded.downloadUrl ?? uploaded.objectUrl,
        } satisfies FrameMedia;
      }),
    );

    const items = uploadResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failedCount = uploadResults.length - items.length;

    if (items.length > 0) {
      addMedia(items);
    }

    if (failedCount === files.length) {
      setUploadError("사진이나 영상을 업로드하지 못했어요. 다시 시도해 주세요.");
    } else if (failedCount > 0) {
      setUploadError(`${failedCount}개 파일은 업로드하지 못했어요. 다시 시도해 주세요.`);
    }

    setIsUploadingFiles(false);
  };

  const handleNext = () => {
    if (selectedCount !== 4) return;
    router.push("/upload/result");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="업로드할 사진 선택"
          backHref="/upload"
          backLabel="프레임 다시 선택"
          description="사진이나 영상을 넣을 프레임에 어울릴 4개를 골라 주세요."
        />

        <FrameSelectPanel
          frameId={frameId ?? null}
          media={media}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          guideText={
            media.length === 0
              ? "먼저 사진이나 영상을 업로드해 주세요."
              : `업로드한 미디어 ${media.length}개 중에서 4개를 골라 주세요.`
          }
          emptyStateText="아직 업로드한 사진이 없어요. 아래 버튼으로 사진이나 영상을 추가해 주세요."
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
          onReset={resetAll}
          onNext={handleNext}
          themeData={themeData}
          borderColor={effectiveBorderColor}
          outputFilter={outputFilter}
          renderExtraControls={() => (
            <>
              <button
                type="button"
                onClick={handleClickUpload}
                disabled={isUploadingFiles}
                className="h-9 rounded-full bg-zinc-800 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingFiles ? "업로드 중..." : "사진 또는 영상 추가하기"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_FOURCUT_ACCEPT}
                multiple
                onChange={handleChangeFiles}
                className="hidden"
              />

              <p className="text-[10px] text-zinc-500">
                여러 파일을 한 번에 넣고 프레임에 어울릴 4개를 선택할 수 있어요.
              </p>

              {uploadError ? (
                <p className="text-[10px] text-rose-300">{uploadError}</p>
              ) : null}

              <FrameOutputOptionsPanel
                borderColor={borderColor}
                onBorderColorChange={setBorderColor}
                outputFilter={outputFilter}
                onOutputFilterChange={setOutputFilter}
                includeVideo={includeVideo}
                onIncludeVideoChange={setIncludeVideo}
                hasCustomFrame={hasCustomFrame}
                videoEligible={videoEligible}
                remainingVideoConversions={remainingVideoConversions}
              />
            </>
          )}
        />
      </div>
    </main>
  );
}
