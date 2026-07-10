"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FrameOutputOptionsPanel } from "@/components/frame/FrameOutputOptionsPanel";
import { FrameSelectPanel } from "@/components/frame/FrameSelectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useRemoteFrameTheme } from "@/hooks/useRemoteFrameTheme";
import { useShootSession } from "@/lib/shootSessionStore";
import { useUnsavedWorkGuard } from "@/hooks/useUnsavedWorkGuard";
import { resolveFrameBackgroundColor } from "@/lib/themeBackground";

export default function ShootSelectPage() {
  const router = useRouter();
  const {
    frameId,
    remoteFrameId,
    shots,
    selectedIndexes,
    borderColor,
    outputFilter,
    toggleSelect,
    clearSelection,
    setBorderColor,
    setOutputFilter,
  } = useShootSession();
  const themeData = useRemoteFrameTheme(remoteFrameId, frameId);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const guestMode = accessMode === "guest";

  // 아직 저장 전인 촬영본이 있으면 새로고침/이탈 시 유실 경고를 띄운다.
  useUnsavedWorkGuard(shots.length > 0);

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

  const shotPhotos = useMemo(() => shots.map((shot) => shot.photo), [shots]);

  const handleNext = () => {
    router.push("/shoot/result");
  };

  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <PageHeader
          backHref="/shoot/capture"
          backLabel="다시 촬영"
          brandHref={guestMode ? "/shoot" : "/home"}
        />
        <StepProgress current={3} total={4} label="사진 선택" />

        <FrameSelectPanel
          frameId={frameId ?? null}
          images={shotPhotos}
          selectedIndexes={selectedIndexes}
          maxSelect={4}
          emptyStateText="촬영한 사진이 없어요. 다시 촬영해 주세요."
          incompleteButtonLabel="4장을 골라주세요"
          nextButtonLabel="다음 단계로"
          onToggleSelect={toggleSelect}
          onReset={clearSelection}
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
              hasCustomFrame={hasCustomFrame}
            />
          )}
        />
      </div>
    </main>
  );
}
