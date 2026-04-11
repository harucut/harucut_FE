"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { useMyFrames } from "@/hooks/useMyFrames";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { parseFrameIdQuery } from "@/lib/frameCatalog";
import { useShootSession } from "@/lib/shootSessionStore";

function ShootPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));
  const queriedRemoteFrameId = Number(searchParams.get("remoteFrameId"));
  const { setFrameId, setRemoteFrameId, reset } = useShootSession();
  const { frames, isLoading, error, refresh } = useMyFrames();

  const [manualSelectedFrameId, setManualSelectedFrameId] = useState<FrameId>(
    queriedFrameId ?? "classic-4",
  );
  const [selectedRemoteFrameId, setSelectedRemoteFrameId] = useState<number | null>(
    Number.isFinite(queriedRemoteFrameId) && queriedRemoteFrameId > 0
      ? queriedRemoteFrameId
      : null,
  );

  useEffect(() => {
    reset();
  }, [reset]);

  const selectedRemoteFrame = useMemo(
    () =>
      selectedRemoteFrameId == null
        ? null
        : frames.find((frame) => frame.frameId == selectedRemoteFrameId) ?? null,
    [frames, selectedRemoteFrameId],
  );

  const selectedFrameId = selectedRemoteFrame
    ? frameIdFromFrameType(selectedRemoteFrame.frameType)
    : manualSelectedFrameId;

  const handleConfirmFrame = () => {
    setFrameId(selectedFrameId);
    setRemoteFrameId(selectedRemoteFrameId);
    router.push("/shoot/capture");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-2 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PageHeader title="??" backHref="/home" backLabel="????" />
        <StepProgress current={1} total={4} label="??? ??" />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setManualSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmFrame}
          confirmLabel="? ????? ????"
        />

        <SavedFramesSection
          title="??? ???"
          description="?? ??? ???? ??? ???? ?? ??? ??? ? ???."
          emptyText="? ??? ???? ??? ???? ?? ???."
          selectedFrameId={selectedFrameId}
          frames={frames}
          isLoading={isLoading}
          error={error}
          selectedRemoteFrameId={selectedRemoteFrameId}
          onSelectRemoteFrame={(frame) => {
            setManualSelectedFrameId(frameIdFromFrameType(frame.frameType));
            setSelectedRemoteFrameId(frame.frameId);
          }}
          onRefresh={refresh}
          selectedStatusText="?? ??"
          idleStatusText="???? ??"
        />
      </div>
    </main>
  );
}

export default function ShootPage() {
  return (
    <Suspense fallback={null}>
      <ShootPageContent />
    </Suspense>
  );
}
