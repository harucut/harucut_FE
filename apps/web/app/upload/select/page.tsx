"use client";

import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import type { FrameMedia } from "@/components/frame/FramePreview";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { SUPPORTED_IMAGE_ACCEPT } from "@/lib/presignedUploadApi";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useUploadSession } from "@/lib/uploadSessionStore";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";

export default function UploadSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    media,
    selectedIndexes,
    borderColor,
    outputFilter,
    toggleSelect,
    clearSelection,
    addMedia,
    setBorderColor,
    setOutputFilter,
  } = useUploadSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 업로드한 사진이 있는데 아직 저장 전이면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(media.length > 0);

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
    }
  }, [frameId, router]);

  const hasCustomFrame = Boolean(themeData);
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((index) => index != null).length,
    [selectedIndexes],
  );

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleChangeFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const items: FrameMedia[] = Array.from(files)
      .map((file) => {
        const url = URL.createObjectURL(file);

        if (file.type.startsWith("image/")) {
          return { type: "image" as const, src: url };
        }

        return null;
      })
      .filter((value): value is FrameMedia => value !== null);

    if (items.length === 0) return;

    addMedia(items);
    event.target.value = "";
  };

  const handleNext = () => {
    if (selectedCount !== 4) return;
    router.push("/upload/result");
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="업로드할 사진 선택"
          backHref="/upload"
          backLabel="프레임 다시 선택"
          description="사진을 넣을 프레임에 어울릴 4장을 골라 주세요."
        />

        <FrameSelectPanel
          frameId={frameId ?? null}
          media={media}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          emptyStateText="아직 업로드한 사진이 없어요. 아래 버튼으로 사진을 추가해 주세요."
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
          onReset={clearSelection}
          onNext={handleNext}
          themeData={themeData}
          borderColor={effectiveBorderColor}
          outputFilter={outputFilter}
          renderExtraControls={() => (
            <>
              <button
                type="button"
                onClick={handleClickUpload}
                className="h-9 rounded-full bg-zinc-800 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700"
              >
                사진 추가하기
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_IMAGE_ACCEPT}
                multiple
                onChange={handleChangeFiles}
                className="hidden"
              />

              <p className="text-[10px] text-zinc-500">
                여러 파일을 한 번에 넣고 프레임에 어울릴 4개를 선택할 수 있어요.
              </p>

              <FrameOutputOptionsPanel
                borderColor={borderColor}
                onBorderColorChange={setBorderColor}
                outputFilter={outputFilter}
                onOutputFilterChange={setOutputFilter}
                hasCustomFrame={hasCustomFrame}
              />
            </>
          )}
        />
      </div>
    </main>
  );
}
