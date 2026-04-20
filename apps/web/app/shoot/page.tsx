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
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)] px-2 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PageHeader
          title={accessMode === "guest" ? "비회원 촬영 체험" : "촬영"}
          backHref={accessMode === "guest" ? "/" : "/home"}
          backLabel={accessMode === "guest" ? "처음으로" : "홈으로"}
          brandHref={accessMode === "guest" ? "/shoot" : "/home"}
          description={
            accessMode === "guest"
              ? "비회원 체험에서는 촬영과 이미지 다운로드만 할 수 있어요."
              : "촬영할 프레임을 먼저 골라 주세요."
          }
        />
        <StepProgress current={1} total={4} label="프레임 선택" />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setManualSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmFrame}
          confirmLabel="촬영 시작하기"
        />

        {accessMode === "member" ? (
          <SavedFramesSection
            title="저장한 프레임"
            description="같은 타입으로 저장한 프레임을 불러와 바로 이어서 촬영할 수 있어요."
            emptyText="이 타입으로 저장한 프레임이 아직 없어요."
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
