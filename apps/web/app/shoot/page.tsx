"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FrameId } from "@/constants/frames";
import { FramePicker } from "@/components/frame/FramePicker";
import { SavedFramesSection } from "@/components/frame/SavedFramesSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FlowSteps } from "@/components/layout/FlowSteps";
import { SHOOT_FLOW_STEPS } from "@/constants/flowSteps";
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
  const { setFrameId, setRemoteFrameId, setEventName, reset } = useShootSession();
  // 행사장 QR 은 `/shoot?frame=...&event=행사이름` 으로 들어온다. 이름은 화면에만 쓰므로
  // 길이를 잘라 두고(제목 한 줄), 앞뒤 공백은 버린다.
  const eventName = (searchParams.get("event") ?? "").trim().slice(0, 40) || null;
  const { frames, isLoading, error, refresh } = useMyFrames();
  const accessMode = useGuestTrialStore((state) => state.accessMode);

  // 기본값을 둔다. /upload·/theme 는 "classic-4" 로 시작하는데 여기만 null 이라,
  // 촬영으로 들어온 사람이 유일하게 비활성 버튼("촬영할 프레임을 선택해주세요")을 먼저 봤다.
  // 가장 흔한 4컷을 미리 골라 두고 바꾸고 싶으면 바꾸게 한다.
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
    // reset 이 세션을 비우므로 행사 이름은 그 뒤에 다시 넣는다.
    setEventName(eventName);
  }, [eventName, reset, setEventName]);

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
          description="촬영할 4컷 프레임을 골라 주세요."
        />

        {eventName ? <EventBanner eventName={eventName} /> : null}

        <FlowSteps steps={SHOOT_FLOW_STEPS} current={0} />

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
            emptyText="저장한 프레임이 없어요."
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
