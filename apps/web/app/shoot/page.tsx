"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FrameChooser } from "@/components/frame/FrameChooser";
import { PageHeader } from "@/components/layout/PageHeader";
import { EventBanner } from "@/components/event/EventBanner";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useMyFrames } from "@/hooks/useMyFrames";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";

/**
 * 두 프레임이 **같은 사진을 쓸 수 있는가**.
 *
 * 촬영본은 찍을 때 그 프레임의 슬롯 비율로 잘려 저장된다. 비율이 크게 다르면 다시 잘라야
 * 하는데, 그러면 사용자가 프리뷰에서 본 것과 다른 그림이 된다(얼굴이 잘린다).
 * 세로 4컷 1.42 ↔ 가로 4컷 1.41 처럼 사실상 같은 것은 통과시키고, 세로 ↔ 네모(0.71)는 막는다.
 */
function slotRatioMatches(a: FrameId, b: FrameId) {
  const slotA = FRAME_LAYOUTS[a]?.slots[0];
  const slotB = FRAME_LAYOUTS[b]?.slots[0];
  if (!slotA || !slotB) return false;
  const ratioA = slotA.width / slotA.height;
  const ratioB = slotB.width / slotB.height;
  return Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) <= 0.05;
}

function ShootPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    setFrameId,
    setRemoteFrameId,
    setSource,
    setEventName,
    reset,
    resetFrameSelection,
  } = useShootSession();
  /*
    `keepShots=1` 로 들어오면 **찍은 사진을 두고** 프레임만 다시 고른다.
    합성이 되돌릴 수 없는 이유로 실패했을 때 결과 화면이 보내는 길이다 — 예전에는 그 길이
    아래 reset() 을 지나며 8장을 통째로 지웠다("다른 프레임을 골라 주세요" 라고 안내해 놓고).
  */
  const keepShots = searchParams.get("keepShots") === "1";
  // 촬영으로 갈지 불러오기로 갈지는 **주소가 들고 있다.** 상태가 아니라 "다음 단계가
  // 무엇인가"라는 라우팅 정보라, 새로고침하거나 링크를 공유해도 그대로여야 한다.
  const source = searchParams.get("source") === "upload" ? "upload" : "camera";
  // 행사장 QR 은 `/shoot?frame=...&event=행사이름` 으로 들어온다. 이름은 화면에만 쓰므로
  // 길이를 잘라 두고(제목 한 줄), 앞뒤 공백은 버린다.
  const queriedEventName =
    (searchParams.get("event") ?? "").trim().slice(0, 40) || null;
  // 화면에는 세션에 자리잡은 값을 쓴다(쿼리 없이 돌아온 경우까지 덮는다).
  const eventName = useShootSession((state) => state.eventName);
  const { frames, isLoading, error, refresh } = useMyFrames();
  const accessMode = useGuestTrialStore((state) => state.accessMode);

  useEffect(() => {
    // 촬영 화면에서 "프레임 다시 선택"으로 돌아오면 주소에 행사 쿼리가 없다. 그때 세션을
    // 비우고 이름까지 null 로 덮으면, 행사 참가자가 컷 구성을 한 번 바꿔보려다 행사 맥락을
    // 통째로 잃는다. 쿼리가 없으면 이미 자리잡은 행사 이름을 그대로 이어 쓴다.
    const carried = useShootSession.getState().eventName;
    if (keepShots) resetFrameSelection();
    else reset();
    setEventName(queriedEventName ?? carried);
    // reset 이 출처를 기본값으로 되돌린다. 주소가 진실이므로 다시 심는다.
    setSource(source);
  }, [
    keepShots,
    queriedEventName,
    reset,
    resetFrameSelection,
    setEventName,
    setSource,
    source,
  ]);

  return (
    <main className="hc-page-app min-h-dvh px-2 py-6 text-(--hc-text) sm:px-4 lg:px-8 lg:py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:max-w-5xl lg:gap-6">
        <PageHeader
          backHref={accessMode === "guest" ? "/" : "/home"}
          backLabel={accessMode === "guest" ? "처음으로" : "홈으로"}
          title="프레임 선택"
        />

        <FrameChooser
          frames={frames}
          isLoading={isLoading}
          error={error}
          onRefresh={refresh}
          confirmLabel={source === "upload" ? "사진 고르러 가기" : "촬영 시작하기"}
          // 비회원은 프레임 조회 자체가 인증이 필요해 목록을 볼 수 없다.
          hideSavedFrames={accessMode !== "member"}
          onConfirm={({ frameId, remoteFrameId }) => {
            setFrameId(frameId);
            setRemoteFrameId(remoteFrameId);
            setSource(source);

            /*
              사진을 들고 왔다면 다시 찍을 필요가 없다 — 새 프레임의 슬롯 비율이 같으면
              고르는 화면으로 바로 보낸다. 비율이 다르면 그 사진을 쓸 수 없으므로
              (슬롯 비율로 잘려 저장돼 있다) 비우고 촬영으로 보낸다.
            */
            const { shots, shotsFrameId, resetShots } = useShootSession.getState();
            if (shots.length > 0 && shotsFrameId) {
              if (slotRatioMatches(shotsFrameId, frameId)) {
                router.push("/shoot/select");
                return;
              }
              resetShots();
            }

            router.push(source === "upload" ? "/shoot/upload" : "/shoot/capture");
          }}
          missingRemoteFrameNotice={
            <p
              role="status"
              className="rounded-2xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-3.5 py-3 text-[12px] leading-[1.6] text-(--hc-danger)"
            >
              링크에 담긴 전용 프레임을 불러오지 못했어요. 아래에서 컷 구성을 고르면
              만드는 것은 그대로 할 수 있어요.
            </p>
          }
        >
          {eventName ? <EventBanner eventName={eventName} /> : null}
        </FrameChooser>
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
