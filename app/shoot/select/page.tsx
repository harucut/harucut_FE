"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useShootSession } from "@/lib/shootSessionStore";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ShootSelectPage() {
  const router = useRouter();
  const { frameId, shots, selectedIndexes, toggleSelect, reset } =
    useShootSession();

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }
    if (!shots.length) {
      router.replace("/shoot/capture");
    }
  }, [frameId, shots.length, router]);

  const shotPhotos = useMemo(() => shots.map((shot) => shot.photo), [shots]);

  const handleNext = () => {
    router.push("/shoot/result");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 py-6">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <PageHeader
          title="사진 선택 · 4장 고르기"
          backHref="/shoot/capture"
          backLabel="다시 촬영"
        />
        <FrameSelectPanel
          frameId={frameId ?? null}
          images={shotPhotos}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          guideText={`방금 촬영한 사진 ${shots.length}장 중에서 최대 4장을 골라주세요.`}
          emptyStateText="촬영된 사진이 없어요. 다시 촬영해 주세요."
          nextButtonLabel="다음 단계로 (프레임 합성 예정)"
          onToggleSelect={toggleSelect}
          onReset={reset}
          onNext={handleNext}
        />
      </div>
    </main>
  );
}
