"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FrameChooser, type FrameChoice } from "@/components/frame/FrameChooser";
import { PageHeader } from "@/components/layout/PageHeader";
import { resolveMembership } from "@/lib/authSession";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useMyFrames } from "@/hooks/useMyFrames";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";

/**
 * 두 프레임이 **같은 촬영본을 쓸 수 있는가**.
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
    reset,
    resetFrameSelection,
  } = useShootSession();
  /*
    `keepShots=1` 로 들어오면 **찍은 사진을 두고** 프레임만 다시 고른다.
    합성이 되돌릴 수 없는 이유로 실패했을 때 결과 화면이 보내는 길이다 — 예전에는 그 길이
    아래 reset() 을 지나며 8장을 통째로 지웠다("다른 프레임을 골라 주세요" 라고 안내해 놓고).
  */
  const keepShots = searchParams.get("keepShots") === "1";
  const [resumeAvailable, setResumeAvailable] = useState(() => !keepShots && useShootSession.getState().shots.length > 0);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [pendingFrame, setPendingFrame] = useState<FrameChoice | null>(null);
  // 촬영으로 갈지 불러오기로 갈지는 **주소가 들고 있다.** 상태가 아니라 "다음 단계가
  // 무엇인가"라는 라우팅 정보라, 새로고침하거나 링크를 공유해도 그대로여야 한다.
  const source = searchParams.get("source") === "upload" ? "upload" : "camera";
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const guestHydrated = useGuestTrialStore((state) => state.hydrated);
  const { frames, isLoading, error, refresh } = useMyFrames(guestHydrated && accessMode === "member");

  useEffect(() => {
    // `keepShots` 없는 진입은 **새 촬영**이다. 이어 가는 진입은 찍은 사진만 두고 프레임을 다시 고른다.
    if (resumeAvailable) return;
    if (keepShots) resetFrameSelection();
    else reset();
    // reset 이 출처를 기본값으로 되돌린다. 주소가 진실이므로 다시 심는다.
    setSource(source);
  }, [resumeAvailable, keepShots, reset, resetFrameSelection, setSource, source]);

  // 인증 쿠키가 남아 있는 방문자만 확인한다. 이미 체험 중인 방문자는 API를 부르지 않는다.
  const checkSession = searchParams.get("checkSession") === "1";
  const enterGuestMode = useGuestTrialStore((state) => state.enterGuestMode);
  const hydrated = useGuestTrialStore((state) => state.hydrated);

  useEffect(() => {
    if (!checkSession || !hydrated || accessMode === "guest") return;

    void (async () => {
      const membership = await resolveMembership();

      /*
        **확정된 답에만 움직인다.** `unknown`(5xx·회선 끊김·재발급 서버 장애)이면 아무것도
        하지 않는다 — 잠깐 못 물어봤다는 이유로 7일짜리 쿠키를 심으면 멀쩡한 회원이 그동안
        기록과 저장 프레임을 잃고, 반대로 걷으면 게스트가 회원 화면을 보게 된다.
        서버가 돌아오면 다음 진입에서 판정된다.
      */
      if (membership === "guest") enterGuestMode();
    })();
  }, [accessMode, checkSession, enterGuestMode, hydrated]);

  const confirmFrame = ({ frameId, remoteFrameId }: FrameChoice, allowReset = false) => {
    const session = useShootSession.getState();
    // 갤러리 사진은 원본이고, 촬영본만 이전 슬롯 비율로 이미 잘려 있다.
    const reusable = source === "upload" ||
      (session.shotsFrameId != null && slotRatioMatches(session.shotsFrameId, frameId));
    if (!allowReset && session.shots.length > 0 && !reusable) {
      setPendingFrame({ frameId, remoteFrameId });
      return;
    }
    setFrameId(frameId);
    setRemoteFrameId(remoteFrameId);
    setSource(source);
    if (session.shots.length > 0 && reusable) {
      router.push("/shoot/select");
      return;
    }
    if (session.shots.length > 0) session.resetShots();
    if (source === "upload") {
      // 인증 프록시가 되돌릴 때도 프레임을 보존한다.
      const next = new URLSearchParams({ frame: frameId });
      router.push(`/shoot/upload?${next.toString()}`);
      return;
    }
    router.push("/shoot/capture");
  };

  if (resumeAvailable) {
    const session = useShootSession.getState();
    const resumePath = session.frameId
      ? session.shots.length >= 4 ? "/shoot/select" : session.source === "upload" ? "/shoot/upload" : "/shoot/capture"
      : "/shoot?keepShots=1";
    return <main className="hc-page-app min-h-dvh p-6 text-(--hc-text)">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <PageHeader title="촬영하던 사진이 있어요" backHref="/home" backLabel="홈으로" />
        <p>{session.shots.length}장을 이 기기에 임시 보관 중이에요. 마지막 작업부터 24시간 동안 이어서 만들 수 있어요.</p>
        <button type="button" className="hc-pressable min-h-11 rounded-xl bg-(--hc-primary) px-4 py-3 font-semibold text-(--hc-primary-contrast)" onClick={() => {
          if (session.frameId) router.push(resumePath);
          else { router.replace(resumePath); setResumeAvailable(false); }
        }}>이어서 만들기</button>
        <button type="button" className="hc-pressable min-h-11 rounded-xl border border-(--hc-border) px-4 py-3" onClick={() => setConfirmRestart(true)}>새로 시작하기</button>
        {confirmRestart && <ConfirmDialog running={false} title="새로 시작할까요?" description={`임시 보관한 사진 ${session.shots.length}장이 이 기기에서 지워져요.`} confirmLabel="사진 지우고 시작" destructive onClose={() => setConfirmRestart(false)} onConfirm={() => { reset(); setConfirmRestart(false); setResumeAvailable(false); }} />}
      </div>
    </main>;
  }

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
          onConfirm={(choice) => confirmFrame(choice)}
          missingRemoteFrameNotice={
            <p
              role="status"
              className="rounded-2xl border border-(--hc-danger-border) bg-(--hc-danger-soft-bg) px-3.5 py-3 text-[12px] leading-[1.6] text-(--hc-danger)"
            >
              링크에 담긴 전용 프레임을 불러오지 못했어요. 아래에서 컷 구성을 고르면
              만드는 것은 그대로 할 수 있어요.
            </p>
          }
        />
        {pendingFrame ? <ConfirmDialog
          title="새 비율로 다시 촬영할까요?"
          description="선택한 프레임은 사진 비율이 달라요. 다시 촬영하면 현재 사진이 이 기기에서 지워져요. 사진을 남기려면 취소하고 같은 비율의 프레임을 골라 주세요."
          confirmLabel="사진 지우고 다시 촬영" destructive running={false}
          onClose={() => setPendingFrame(null)}
          onConfirm={() => { const choice = pendingFrame; setPendingFrame(null); confirmFrame(choice, true); }}
        /> : null}
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
