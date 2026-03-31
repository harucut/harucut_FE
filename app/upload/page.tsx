"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { useMyFrames } from "@/hooks/useMyFrames";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { parseFrameIdQuery } from "@/lib/frameCatalog";
import { useUploadSession } from "@/lib/uploadSessionStore";

export default function UploadFramePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));
  const queriedRemoteFrameId = Number(searchParams.get("remoteFrameId"));
  const { setFrameId, setRemoteFrameId, resetAll } = useUploadSession();
  const { frames, isLoading, error, refresh } = useMyFrames();

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
    queriedFrameId ?? "classic-4",
  );
  const [selectedRemoteFrameId, setSelectedRemoteFrameId] = useState<number | null>(
    Number.isFinite(queriedRemoteFrameId) && queriedRemoteFrameId > 0
      ? queriedRemoteFrameId
      : null,
  );

  useEffect(() => {
    resetAll();
  }, [resetAll]);

  useEffect(() => {
    if (!Number.isFinite(queriedRemoteFrameId) || queriedRemoteFrameId <= 0) return;
    if (isLoading) return;

    const targetFrame = frames.find((frame) => frame.frameId === queriedRemoteFrameId);
    if (!targetFrame) return;

    setSelectedFrameId(frameIdFromFrameType(targetFrame.frameType));
    setSelectedRemoteFrameId(targetFrame.frameId);
  }, [frames, isLoading, queriedRemoteFrameId]);

  const handleConfirmFrame = () => {
    setFrameId(selectedFrameId);
    setRemoteFrameId(selectedRemoteFrameId);
    router.push("/upload/select");
  };

  return (
    <main className="min-h-dvh bg-zinc-950 px-2 py-6 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <PageHeader title="업로드" backHref="/home" backLabel="처음으로" />
        <StepProgress current={1} total={3} label="프레임 선택" />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmFrame}
          confirmLabel="이 프레임으로 업로드하기"
        />

        <SavedFramesSection
          title="저장한 프레임"
          description="같은 프레임 타입으로 저장한 프레임만 다음 단계에 적용할 수 있어요."
          emptyText="이 프레임 타입으로 저장한 프레임이 아직 없어요."
          selectedFrameId={selectedFrameId}
          frames={frames}
          isLoading={isLoading}
          error={error}
          selectedRemoteFrameId={selectedRemoteFrameId}
          onSelectRemoteFrame={(frame) => {
            setSelectedFrameId(frameIdFromFrameType(frame.frameType));
            setSelectedRemoteFrameId(frame.frameId);
          }}
          onRefresh={refresh}
          selectedStatusText="적용 예정"
          idleStatusText="클릭해서 적용"
        />
      </div>
    </main>
  );
}
