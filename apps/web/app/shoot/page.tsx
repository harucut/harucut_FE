"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { useMyFrames } from "@/hooks/useMyFrames";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
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
  const accessMode = useGuestTrialStore((state) => state.accessMode);

  const [manualSelectedFrameId, setManualSelectedFrameId] = useState<FrameId | null>(
    queriedFrameId ?? null,
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
    if (!selectedFrameId) return;

    setFrameId(selectedFrameId);
    setRemoteFrameId(selectedRemoteFrameId);
    router.push("/shoot/capture");
  };

  return (
    <main className="hc-page-app min-h-dvh px-2 py-6 text-[color:var(--hc-text)] sm:px-4 lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-5xl lg:gap-6">
        <PageHeader
          backHref={accessMode === "guest" ? "/" : "/home"}
          backLabel={accessMode === "guest" ? "처음으로" : "홈으로"}
          brandHref={accessMode === "guest" ? "/shoot" : "/home"}
          title="프레임 선택"
          description="촬영할 4컷 프레임을 골라주세요."
        />
        <StepProgress current={1} total={4} label="프레임 선택" />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setManualSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmFrame}
          confirmDisabled={!selectedFrameId}
          confirmLabel={selectedFrameId ? "촬영 시작하기" : "촬영할 프레임을 선택해주세요"}
        />

        {accessMode === "member" ? (
          <SavedFramesSection
            title="저장한 프레임"
            emptyText="저장된 프레임이 없습니다."
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
            selectedStatusText="선택됨"
            idleStatusText="클릭해서 선택"
          />
        ) : null}
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
