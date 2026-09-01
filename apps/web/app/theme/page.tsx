"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolvePlanInfo } from "@/constants/planLimits";
import { resolveFrameCapacity } from "@/components/frame/FrameCapacityMeter";
import { FrameChooser } from "@/components/frame/FrameChooser";
import { PageHeader } from "@/components/layout/PageHeader";
import { useMyFrames } from "@/hooks/useMyFrames";
import type { RemoteFrame, SubscriptionUsage } from "@/lib/api-types";
import { frameIdFromFrameType } from "@/lib/frameApi";
import { useThemeSession } from "@/lib/themeSessionStore";
import { getMyUserInfo, getSubscriptionUsage } from "@/lib/userApi";

function ThemePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // 보관함이 요금제 한도에 도달했는지. 만들기를 막지는 않고 미리 알리기만 한다.
  const isAtCapacity = capacity.atCapacity;

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
          backLabel="홈으로"
          title="프레임 꾸미기"
          rightBelow={
            /*
              몇 개까지 되는지는 만들기 전에 알아야 한다 — 다 꾸미고 저장하려는 순간
              한도를 만나면 되돌릴 수 없다. 등급(PRO 같은 것)은 붙이지 않는다.
              여기서 알고 싶은 건 등급이 아니라 "지금 몇 개 더 되는가"다.

              **무제한이면 아무것도 쓰지 않는다.** 셀 이유가 없는 사람에게 숫자를 주면
              읽을 것만 늘어난다. 불러오기 전에도 비워 둔다 — 0/0 이 스쳤다 바뀌면
              오히려 헷갈린다.
            */
            isLoading || capacity.unlimited ? null : (
              <span
                className="text-[12px] font-semibold tabular-nums text-[color:var(--hc-muted)]"
                aria-label={`보관 ${capacity.used}개 / ${capacity.used + (capacity.remaining ?? 0)}개`}
              >
                {capacity.used}/{capacity.used + (capacity.remaining ?? 0)}
              </span>
            )
          }
        />

        <FrameChooser
          frames={frames}
          isLoading={isLoading}
          error={error}
          onRefresh={refresh}
          // 라벨은 "불러오는 중..."인데 버튼은 눌렸다. 눌러도 조용히 빠져나가서, 목록이
          // 늦게 오는 날에는 아무 반응 없는 버튼이 됐다. 상태와 라벨을 맞춘다.
          confirmDisabled={isLoading}
          confirmLabel={isLoading ? "불러오는 중..." : "새 프레임 만들기"}
          // 확인은 **언제나 새 프레임**이다. 목록에서 고른 것은 컷 구성만 따라가고,
          // 그 프레임을 이어서 고치는 길은 아래 "수정하기"다.
          onConfirm={({ frameId }) => {
            if (isLoading) return;
            setFrameId(frameId);
            setRemoteFrameId(null);
            router.push("/theme/sticker");
          }}
          savedFrameAction={{ label: "수정하기", onAction: handleOpenRemoteFrame }}
          belowPicker={
            /*
              몇 개까지 되는지는 **만들기 전에** 알아야 한다 — 만든 뒤에 알면 늦다.
              요금제 이름(PRO 같은 것)은 붙이지 않는다. 여기서 알고 싶은 것은 등급이
              아니라 "지금 몇 개 더 되는가"다. 등급은 마이페이지가 맡는다.
            */
            isLoading ? null : isAtCapacity ? (
              <p className="-mt-1 text-[12px] leading-[1.6] text-[color:var(--hc-muted)]">
                {capacity.plan.limit <= 0 && !capacity.unlimited
                  ? "지금은 프레임을 보관할 수 없어요. 꾸민 프레임으로 촬영하려면 먼저 저장해야 해요."
                  : "보관함이 가득 찼어요. 새로 저장하려면 기존 프레임을 지워야 해요."}
              </p>
            ) : null
          }
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
