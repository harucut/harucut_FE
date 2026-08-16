"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { PAYMENTS_ENABLED } from "@/constants/company";
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

    setFrameId(frameIdFromFrameType(targetFrame.frameType));
    setRemoteFrameId(targetFrame.frameId);
    router.push("/theme/sticker");
  }, [
    frames,
    isLoading,
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
    // 한도에 걸렸다고 에디터 자체를 막지 않는다. 예전에는 /pricing 으로 보냈는데,
    // 결제가 아직 열려 있지 않아 거기서 할 수 있는 일이 없었다 — 무료 사용자에게는
    // 프레임 만들기가 통째로 막힌 길이었다. 한도는 "보관"에 걸리는 것이고,
    // 만들어서 지금 촬영에 쓰는 것은 막을 이유가 없다. 저장 시점에 서버가 판정한다.
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
          // 결제가 열리기 전에는 업그레이드 버튼이 아무 데도 데려다주지 못한다.
          onUpgrade={PAYMENTS_ENABLED ? () => router.push("/pricing") : undefined}
        />

        <FramePicker
          selectedFrameId={selectedFrameId}
          onChangeSelected={(nextFrameId) => {
            setSelectedFrameId(nextFrameId);
            setSelectedRemoteFrameId(null);
          }}
          onConfirm={handleConfirmNewFrame}
          // 라벨은 "불러오는 중..."인데 버튼은 눌렸다. 눌러도 handleConfirmNewFrame 이
          // 조용히 빠져나가서, 목록이 늦게 오는 날에는 아무 반응 없는 버튼이 됐다.
          // 상태와 라벨을 맞춘다.
          confirmDisabled={isLoading}
          confirmLabel={isLoading ? "불러오는 중..." : "새 프레임 만들기"}
        />

        {/* 보관이 안 되는 상태라면 만들기 전에 알려 준다 — 만든 뒤에 알면 늦다. */}
        {!isLoading && isAtCapacity ? (
          <p className="-mt-1 text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
            {capacity.plan.limit <= 0 && !capacity.unlimited
              ? "지금 요금제로는 프레임을 보관할 수 없어요. 만들어서 이번 촬영에는 바로 쓸 수 있고, 보관은 유료 요금제부터예요."
              : "보관함이 가득 찼어요. 새로 만들어 이번 촬영에 쓸 수는 있지만, 저장하려면 기존 프레임을 지우거나 요금제를 올려야 해요."}
          </p>
        ) : null}

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

