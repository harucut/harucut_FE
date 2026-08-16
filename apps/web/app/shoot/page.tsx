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
  const queriedEventName =
    (searchParams.get("event") ?? "").trim().slice(0, 40) || null;
  // 화면에는 세션에 자리잡은 값을 쓴다(쿼리 없이 돌아온 경우까지 덮는다).
  const eventName = useShootSession((state) => state.eventName);
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
    // 촬영 화면에서 "프레임 다시 선택"으로 돌아오면 주소에 행사 쿼리가 없다. 그때 세션을
    // 비우고 이름까지 null 로 덮으면, 행사 참가자가 컷 구성을 한 번 바꿔보려다 행사 맥락을
    // 통째로 잃는다. 쿼리가 없으면 이미 자리잡은 행사 이름을 그대로 이어 쓴다.
    const carried = useShootSession.getState().eventName;
    reset();
    setEventName(queriedEventName ?? carried);
  }, [queriedEventName, reset, setEventName]);

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

  /*
    주소에 저장 프레임 번호가 있는데 그 프레임을 못 불러온 상태.

    프레임 조회(`/api/auth/user/frame`)는 인증이 필요해서, 행사 QR로 들어온 비회원은
    주최자가 만든 프레임을 애초에 읽을 수 없다. 회원이라도 남의 프레임이면 목록에 없다.
    예전에는 이때 조용히 기본 레이아웃으로 떨어져서, 참가자는 "행사 프레임으로 찍고 있다"고
    믿은 채 아무 장식 없는 네 컷을 들고 갔다. 조용히 다른 걸 주느니 사실대로 말한다.

    남은 과제: 비인증으로 읽을 수 있는 공개 프레임 조회가 서버에 생기면 여기서 불러온다.
  */
  const requestedRemoteFrameMissing =
    selectedRemoteFrameId != null && !isLoading && selectedRemoteFrame == null;

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

        {requestedRemoteFrameMissing ? (
          <p
            role="status"
            className="rounded-2xl border border-[color:var(--hc-danger-border)] bg-[color:var(--hc-danger-soft-bg)] px-3.5 py-3 text-[12px] leading-[1.6] text-[color:var(--hc-danger)]"
          >
            링크에 담긴 전용 프레임을 불러오지 못했어요. 아래에서 컷 구성을 고르면 촬영은
            그대로 할 수 있어요.
          </p>
        ) : null}

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
