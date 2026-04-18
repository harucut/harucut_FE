"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useShootSession } from "@/lib/shootSessionStore";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";
import { useVideoConversionQuotaStore } from "@/lib/videoConversionQuotaStore";

export default function ShootSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    includeVideo,
    toggleSelect,
    reset,
    setBorderColor,
    setOutputFilter,
    setIncludeVideo,
  } = useShootSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const usedVideoConversions = useVideoConversionQuotaStore((state) => state.usedCount);
  const videoConversionLimit = useVideoConversionQuotaStore((state) => state.limit);

  useEffect(() => {
    if (!frameId) {
      router.replace("/shoot");
      return;
    }

    if (!shots.length) {
      router.replace("/shoot/capture");
    }
  }, [frameId, router, shots.length]);

  const hasCustomFrame = Boolean(themeData);
  const effectiveBorderColor = resolveFrameBackgroundColor(themeData, borderColor);

  const selectedShots = useMemo(
    () => selectedIndexes.map((index) => (index == null ? null : shots[index] ?? null)),
    [selectedIndexes, shots],
  );
  const shotPhotos = useMemo(() => shots.map((shot) => shot.photo), [shots]);
  const videoEligible = useMemo(
    () => selectedShots.some((shot) => Boolean(shot?.video)),
    [selectedShots],
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

  const handleNext = () => {
    router.push("/shoot/result");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          title="사진 선택"
          backHref="/shoot/capture"
          backLabel="다시 촬영"
          description="마음에 드는 사진 4장을 고르고 출력 옵션을 정해 주세요."
        />

        <FrameSelectPanel
          frameId={frameId ?? null}
          images={shotPhotos}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          guideText={`방금 촬영한 사진 ${shots.length}장 중에서 4장을 골라 주세요.`}
          emptyStateText="촬영한 사진이 없어요. 다시 촬영해 주세요."
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
          onReset={reset}
          onNext={handleNext}
          themeData={themeData}
          borderColor={effectiveBorderColor}
          outputFilter={outputFilter}
          renderExtraControls={() => (
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
          )}
        />
      </div>
    </main>
  );
}
