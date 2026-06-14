"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { resolvePlanInfo } from "@/constants/planLimits";
import { FrameCapacityMeter } from "@/components/frame/FrameCapacityMeter";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { StepProgress } from "@/components/layout/StepProgress";
import { useMyFrames } from "@/hooks/useMyFrames";
import type { RemoteFrame } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { parseFrameIdQuery } from "@/lib/frameCatalog";
import { useThemeSession } from "@/lib/themeSessionStore";
import { getMyUserInfo } from "@/lib/userApi";

function ThemePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));
  const queriedRemoteFrameId = Number(searchParams.get("remoteFrameId"));
  const { setFrameId, setRemoteFrameId, reset } = useThemeSession();
  const { frames, isLoading, error, refresh } = useMyFrames();

  const [planTier, setPlanTier] = useState<"BASIC" | "PLUS" | "PRO" | null>(null);
  const plan = resolvePlanInfo(planTier);

  const [selectedFrameId, setSelectedFrameId] = useState<FrameId>(
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

  useEffect(() => {
    let cancelled = false;
    void getMyUserInfo()
      .then((user) => {
        if (!cancelled) setPlanTier(user.planTier ?? "BASIC");
      })
      .catch(() => {
        if (!cancelled) setPlanTier("BASIC");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(queriedRemoteFrameId) || queriedRemoteFrameId <= 0) return;
    if (isLoading) return;

    const targetFrame = frames.find((frame) => frame.frameId === queriedRemoteFrameId);
    if (!targetFrame) return;

    setFrameId(frameIdFromFrameType(targetFrame.frameType));
    setRemoteFrameId(targetFrame.frameId);
    router.push("/theme/sticker");
  }, [frames, isLoading, queriedRemoteFrameId, router, setFrameId, setRemoteFrameId]);

  const handleConfirmNewFrame = () => {
    setFrameId(selectedFrameId);
    setRemoteFrameId(null);
    setSelectedRemoteFrameId(null);
    router.push("/theme/sticker");
  };

  const handleOpenRemoteFrame = (frame: RemoteFrame) => {
    setFrameId(frameIdFromFrameType(frame.frameType));
    setRemoteFrameId(frame.frameId);
    router.push("/theme/sticker");
  };

  return (
    <main className="hc-page-app min-h-dvh px-2 py-6 text-[color:var(--hc-text)] sm:px-4 lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-5xl lg:gap-6">
        <PageHeader
          backHref="/home"
          backLabel="처음으로"
          title="프레임 꾸미기"
          description="새 프레임을 만들거나 저장한 프레임을 이어서 꾸며보세요."
        />
        <StepProgress current={1} total={2} label="프레임 선택" />

        <FrameCapacityMeter
          plan={plan}
          used={frames.length}
          onUpgrade={() => router.push("/pricing")}
        />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmNewFrame}
          confirmLabel="새 프레임 만들기"
        />

        <SavedFramesSection
          title="저장한 프레임"
          emptyText="저장한 프레임이 없어요."
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
          onAction={handleOpenRemoteFrame}
          actionLabel="수정하기"
          planLimit={plan.limit}
          onUpgrade={() => router.push("/pricing")}
        />
      </div>
    </main>
  );
}

export default function ThemePage() {
  return (
    <Suspense fallback={null}>
      <ThemePageContent />
    </Suspense>
  );
}

