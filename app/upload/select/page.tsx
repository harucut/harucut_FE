"use client";

import { useEffect, useMemo, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { useUploadSession } from "@/lib/uploadSessionStore";
import type { FrameMedia } from "@/components/frame/FramePreview";

export default function UploadSelectPage() {
  const router = useRouter();
  const { frameId, media, selectedIndexes, toggleSelect, resetAll, addMedia } =
    useUploadSession();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!frameId) {
      router.replace("/upload");
    }
  }, [frameId, router]);

  const selectedCount = useMemo(
    () => selectedIndexes.filter((i) => i != null).length,
    [selectedIndexes]
  );

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleChangeFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const items: FrameMedia[] = Array.from(files)
      .map((file) => {
        const url = URL.createObjectURL(file);

        if (file.type.startsWith("image/")) {
          return { type: "image" as const, src: url };
        }
        if (file.type.startsWith("video/")) {
          return { type: "video" as const, src: url };
        }
        // 이미지/비디오 아니면 무시
        return null;
      })
      .filter((v): v is FrameMedia => v !== null);

    if (items.length === 0) return;

    addMedia(items); // 기존 media 뒤에 누적
  };

  const handleNext = () => {
    if (selectedCount !== 4) return;
    router.push("/upload/result"); // 나중에 구현할 페이지
  };

  return (
    <FrameSelectPanel
      frameId={frameId ?? null}
      media={media}
      selectedIndexes={selectedIndexes}
      maxSelect={4}
      headerTitle="업로드 · 사진 선택"
      backHref="/upload"
      backLabel="프레임 다시 선택"
      guideText={
        media.length === 0
          ? "먼저 사진이나 동영상을 업로드해 주세요."
          : `업로드한 미디어 ${media.length}개 중에서 최대 ${4}개를 골라주세요.`
      }
      emptyStateText="아직 업로드된 사진이 없어요. 아래 버튼으로 사진을 추가해 주세요."
      nextButtonLabel="다음 단계로 (프레임 합성 예정)"
      onToggleSelect={toggleSelect}
      onReset={resetAll}
      onNext={handleNext}
      renderExtraControls={() => (
        <>
          <button
            type="button"
            onClick={handleClickUpload}
            className="h-9 rounded-full bg-zinc-800 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700"
          >
            사진 업로드하기
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleChangeFiles}
            className="hidden"
          />

          <p className="text-[10px] text-zinc-500">
            여러 장 업로드한 뒤, 인생네컷에 넣을 사진 4장을 골라보세요.
          </p>
        </>
      )}
    />
  );
}
