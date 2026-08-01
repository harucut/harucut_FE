"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { resolvePlanInfo } from "@/constants/planLimits";
import {
  FrameCapacityMeter,
  resolveFrameCapacity,
} from "@/components/frame/FrameCapacityMeter";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { useMyFrames } from "@/hooks/useMyFrames";
import type { RemoteFrame, SubscriptionUsage } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { parseFrameIdQuery } from "@/lib/frameCatalog";
import { useThemeSession } from "@/lib/themeSessionStore";
import { getMyUserInfo, getSubscriptionUsage } from "@/lib/userApi";

function ThemePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queriedFrameId = parseFrameIdQuery(searchParams.get("frame"));
  const queriedRemoteFrameId = Number(searchParams.get("remoteFrameId"));
  const { setFrameId, setRemoteFrameId, reset } = useThemeSession();
  const { frames, isLoading, error, refresh } = useMyFrames();

  const [planTier, setPlanTier] = useState<"BASIC" | "PLUS" | "PRO" | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  // 보관 한도·사용량은 서버 구독 사용량을 우선 쓰고, 미조회 시에만 목록 개수로 폴백한다.
  // (다운그레이드 초과분은 비활성 처리라 목록 길이가 실제 사용량보다 클 수 있다)
  const capacity = resolveFrameCapacity(
    resolvePlanInfo(planTier),
    usage,
    frames.length,
  );
  const plan = capacity.plan;

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
    void getSubscriptionUsage()
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        // 미조회 시 tier 기반 기본 한도 유지
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Number.isFinite(queriedRemoteFrameId) || queriedRemoteFrameId <= 0) return;
    if (isLoading) return;

    const targetIndex = frames.findIndex(
      (frame) => frame.frameId === queriedRemoteFrameId,
    );
    if (targetIndex === -1) return;

    const targetFrame = frames[targetIndex];
    if (targetIndex >= plan.limit) return;

    setFrameId(frameIdFromFrameType(targetFrame.frameType));
    setRemoteFrameId(targetFrame.frameId);
    router.push("/theme/sticker");
  }, [
    frames,
    isLoading,
    plan.limit,
    queriedRemoteFrameId,
    router,
    setFrameId,
    setRemoteFrameId,
  ]);

  // 보관함이 요금제 한도에 도달하면 새 프레임 생성 진입을 막는다(서버 한도 우회 방지).
  // 잔여 개수는 서버값(frameRetentionRemainingCount)을 우선한다.
  const isAtCapacity = capacity.atCapacity;

  const handleConfirmNewFrame = () => {
    // 목록 로딩 전에는 frames가 빈 배열이라 한도를 알 수 없으므로 진입을 보류한다.
    if (isLoading) return;
    if (isAtCapacity) {
      router.push("/pricing");
      return;
    }
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

        <FrameCapacityMeter
          plan={plan}
          used={capacity.used}
          remaining={capacity.remaining}
          onUpgrade={() => router.push("/pricing")}
        />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmNewFrame}
          confirmLabel={
            isLoading
              ? "불러오는 중..."
              : isAtCapacity
                ? "보관함이 가득 찼어요 · 업그레이드"
                : "새 프레임 만들기"
          }
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

