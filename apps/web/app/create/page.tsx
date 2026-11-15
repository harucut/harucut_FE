"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FrameChooser, type FrameChoice } from "@/components/frame/FrameChooser";
import { PageHeader } from "@/components/layout/PageHeader";
import { resolveMembership } from "@/lib/authSession";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { useMyFrames } from "@/hooks/useMyFrames";
import { isGuestVisitor, useGuestTrialStore } from "@/lib/guestTrialStore";
import { useShootSession } from "@/lib/shootSessionStore";
import type { FrameId } from "@/constants/frames";
import { Sentences } from "@/components/ui/Sentences";
import { checkSavedFrame } from "@/lib/savedFrameCheck";

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
  /*
    회원이 찍던 사진을 들고 있으면 먼저 묻는다(「촬영하던 사진이 있어요」). 끝난 촬영(shootSessionStore 의 completed)은
    묻지 않고 새 촬영으로 시작한다 — 회원 사진은 기록에 남았다. `keepShots` 로 와도 끝난 촬영은 이어 고르지 않는다.

    비회원은 묻지 않는다(2026-11-15 「비회원 촬영하던 사진 관리 안 해도 될 거 같아. 지워버려 / 그러면 당연히 새로 시작
    화면도 없어져야겠지?」). 비회원 사진은 이 기기에 남기지 않으니(lib/shootSessionPersistence.ts) 이 화면에 오면 새
    촬영이다 — 같은 탭에서 들고 온 사진도 지운다(프레임만 다시 고르는 `keepShots` 는 빼고). 예전에는 비회원에게도 「이어서 만들기」·「새로 시작하기」와,
    이 기기에서 만든 완성 사진을 다시 보는 「완성한 사진이 있어요」가 떴다.
  */
  const [resumeOffered, setResumeOffered] = useState(() => {
    const session = useShootSession.getState();
    if (session.shots.length === 0 || session.completed || isGuestVisitor()) return false;
    return !keepShots;
  });
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [pendingFrame, setPendingFrame] = useState<FrameChoice | null>(null);
  // 촬영으로 갈지 불러오기로 갈지는 **주소가 들고 있다.** 상태가 아니라 "다음 단계가
  // 무엇인가"라는 라우팅 정보라, 새로고침하거나 링크를 공유해도 그대로여야 한다.
  const source = searchParams.get("source") === "upload" ? "upload" : "camera";
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const guestHydrated = useGuestTrialStore((state) => state.hydrated);
  const { frames, isLoading, error, refresh } = useMyFrames(guestHydrated && accessMode === "member");
  // 이 화면에 있는 동안 비회원으로 확정돼도(아래 checkSession) 묻던 것을 거두고 새 촬영으로 간다.
  const resumeAvailable = resumeOffered && !(guestHydrated && accessMode === "guest");

  useEffect(() => {
    // `keepShots` 없는 진입은 **새 촬영**이다. 이어 가는 진입은 찍은 사진만 두고 프레임을 다시 고른다.
    if (resumeAvailable) return;
    // 끝난 촬영은 `keepShots` 로 와도 사진을 들고 가지 않는다 — 같은 사진으로 다시 만드는 길이 된다.
    if (keepShots && !useShootSession.getState().completed) resetFrameSelection();
    else reset();
    // reset 이 출처를 기본값으로 되돌린다. 주소가 진실이므로 다시 심는다.
    setSource(source);
  }, [resumeAvailable, keepShots, reset, resetFrameSelection, setSource, source]);

  // 인증 쿠키가 남아 있는 방문자만 확인한다. 이미 체험 중인 방문자는 API를 부르지 않는다.
  const checkSession = searchParams.get("checkSession") === "1";
  const enterGuestMode = useGuestTrialStore((state) => state.enterGuestMode);
  const exitGuestMode = useGuestTrialStore((state) => state.exitGuestMode);
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

  /*
    저장한 프레임은 **찍기 전에** 쓸 수 있는지 본다(2026-11-15 「프레임에 문제가 있던 거면 촬영 전에부터 말해주는
    게 맞지 않을까?」, lib/savedFrameCheck.ts). 예전에는 다 찍고 고른 뒤 합성에서야 「프레임을 불러오지 못했어요」가
    떴다. 문제가 있으면 확인 단추 바로 위에 까닭을 말하고 이 화면에 둔다. 다른 프레임을 고르면 안내는 거둔다.
    기본 레이아웃은 확인할 것이 없다(서버의 기본 프레임이 없으면 기기 합성으로 넘어간다).

    사진 불러오기도 **들어가기 전에** 막는다(2026-11-15 「회원인지 확인을 못 했으면 업로드 페이지에 들여보내는 게
    아니라 모달로 안내를 하든 해야지? 로그인이 된 상태면 그러면 안 되는 거고」 「들어오기 전에 막는 게 맞는 거
    같은데」). 예전에는 불러오기 화면에 먼저 들여보내고 그 안에서 물었다 — 답이 늦으면 조작이 잠긴 채 기다렸고,
    못 받으면 로그인한 사람에게도 「회원인지 확인하지 못했어요」를 띄웠다. 지금은 「사진 고르러 가기」를 누를 때
    묻는다(mayEnterUpload).
  */
  const [checking, setChecking] = useState(false);
  const [confirmProblem, setConfirmProblem] = useState<string | null>(null);

  /*
    사진 불러오기에 들여보내도 되는가. 회원이면 들여보내고, 아니면 이 자리에서 회원 전용 안내 창을 띄운다.

    서버가 답하지 못하면(`unknown`) **이 기기가 아는 상태를 따른다** — 로그인해 있으면 들여보내고, 체험 중이면
    안내 창이다. 잠깐 못 물어봤다고 로그인한 사람을 막지 않는다. 쿠키는 확정된 답에만 바꾼다
    (체험 쿠키는 남았는데 세션은 멀쩡한 회원은 걷고, 세션이 끊긴 회원은 체험으로 돌린다 — 불러오기 화면과 같은 판단).

    안내 창은 프록시가 비회원을 되돌릴 때와 같은 자리에 띄운다 — 카메라로 찍는 프레임 고르기, 고른 프레임은 그대로.
    「촬영 계속하기」를 누르면 그대로 찍으러 갈 수 있다. `guestNotice` 는 GuestTrialBridge 가 읽고 주소에서 걷는다.
  */
  const mayEnterUpload = async (frameId: FrameId) => {
    const verdict = await resolveMembership();
    const membership = verdict === "unknown" ? accessMode : verdict;
    if (membership === "member") {
      if (verdict === "member" && accessMode === "guest") exitGuestMode();
      return true;
    }
    if (verdict === "guest" && accessMode !== "guest") enterGuestMode();
    router.replace(`/create?${new URLSearchParams({ guestNotice: "restricted", frame: frameId }).toString()}`);
    return false;
  };

  const confirmFrame = async (choice: FrameChoice, allowReset = false) => {
    // 「사진 지우고 다시 찍기」로 확인하고 온 길(allowReset)은 이미 이 확인을 지났다.
    const savedFrameId = allowReset ? null : choice.remoteFrameId;
    // 갤러리 사진을 들고 있으면 불러오기 화면을 지나지 않고 고르기로 간다(proceedWithFrame).
    const entersUpload = source === "upload" && useShootSession.getState().shots.length === 0;
    if (savedFrameId != null || entersUpload) {
      setChecking(true);
      setConfirmProblem(null);
      if (entersUpload && !(await mayEnterUpload(choice.frameId))) {
        setChecking(false);
        return;
      }
      const problem = savedFrameId != null ? await checkSavedFrame(savedFrameId) : null;
      setChecking(false);
      if (problem) {
        setConfirmProblem(problem);
        return;
      }
    }
    proceedWithFrame(choice, allowReset);
  };

  const proceedWithFrame = ({ frameId, remoteFrameId }: FrameChoice, allowReset: boolean) => {
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
      router.push("/create/select");
      return;
    }
    if (session.shots.length > 0) session.resetShots();
    // 갤러리에서 불러오기는 따로 화면이 없다 — 사진 고르기 화면 안에서 불러온다(2026-11-15).
    if (source === "upload") {
      router.push("/create/select");
      return;
    }
    // 촬영 화면에는 뒤로가기 단추가 없다(2026-11-15). 기기·브라우저의 뒤로가기로 돌아와도 고른 레이아웃이 남게
    // 이 화면 주소에 적어 둔다 — 예전 단추가 `/create?frame=` 로 보내던 것과 같은 자리로 돌아온다.
    const here = new URLSearchParams(searchParams.toString());
    here.set("frame", frameId);
    window.history.replaceState(null, "", `?${here.toString()}`);
    router.push("/create/capture");
  };

  if (resumeAvailable) {
    const session = useShootSession.getState();
    const resumePath = session.frameId
      ? session.shots.length >= 4 || session.source === "upload" ? "/create/select" : "/create/capture"
      : "/create?keepShots=1";
    return <main className="hc-page-app min-h-dvh p-6 text-(--hc-text)">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <PageHeader title="촬영하던 사진이 있어요" backHref="/home" backLabel="홈으로" />
        <p><Sentences text={`${session.shots.length}장을 이 기기에 임시 보관 중이에요. 마지막 작업부터 24시간 동안 이어서 만들 수 있어요.`} /></p>
        <button type="button" className="hc-pressable min-h-11 rounded-xl bg-(--hc-primary) px-4 py-3 font-semibold text-(--hc-primary-contrast)" onClick={() => {
          if (session.frameId) router.push(resumePath);
          else { router.replace(resumePath); setResumeOffered(false); }
        }}>이어서 만들기</button>
        <button type="button" className="hc-pressable min-h-11 rounded-xl border border-(--hc-border) px-4 py-3" onClick={() => setConfirmRestart(true)}>새로 시작하기</button>
        {confirmRestart && <ConfirmDialog running={false} title="새로 시작할까요?" description={`임시 보관한 사진 ${session.shots.length}장이 이 기기에서 지워져요.`} confirmLabel="사진 지우고 시작" destructive onClose={() => setConfirmRestart(false)} onConfirm={() => { reset(); setConfirmRestart(false); setResumeOffered(false); }} />}
      </div>
    </main>;
  }

  return (
    <main className="hc-page-app flex min-h-dvh flex-col px-2 pb-0 pt-6 text-(--hc-text) sm:px-4 md:pb-6 lg:px-8 lg:py-10">
      {/* 주 버튼이 화면 아래에 붙도록 안쪽이 남은 높이를 채운다(FramePickerConfirm). */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 md:max-w-3xl lg:max-w-5xl lg:gap-6">
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
          confirmLabel={source === "upload" ? "사진 고르러 가기" : "이 프레임으로 찍기"}
          // 비회원은 프레임 조회 자체가 인증이 필요해 목록을 볼 수 없다.
          hideSavedFrames={accessMode !== "member"}
          onConfirm={(choice) => void confirmFrame(choice)}
          confirmNotice={confirmProblem}
          confirmBusy={checking}
          onSelectionChange={() => setConfirmProblem(null)}
        />
        {/*
          찍어 둔 사진을 들고 칸 모양이 다른 프레임을 고르면 묻는다(slotRatioMatches). 찍은 사진은 찍을 때 칸 모양대로
          잘려 남아서 다른 모양의 칸에는 넣을 수 없다 — 넣으면 얼굴이 잘린다. 다시 찍으면 찍어 둔 사진은 지워진다.
          예전 제목 「새 비율로 다시 찍을까요?」는 무엇이 사라지는지 말하지 않아 무슨 창인지 알 수 없었다(2026-11-15
          「새 비율로 다시 찍을까요는 뭐야 / 다시 찍으면 찍어둔 건 사라지는 거지」). 제목이 먼저 그 일을 말한다.
        */}
        {pendingFrame ? <ConfirmDialog
          title="찍어 둔 사진을 지울까요?"
          description={`고른 프레임은 칸 모양이 달라서 찍어 둔 사진 ${useShootSession.getState().shots.length}장을 넣을 수 없어요. 사진을 두려면 취소하고 같은 모양의 프레임을 골라 주세요.`}
          confirmLabel="지우고 다시 찍기" destructive running={false}
          onClose={() => setPendingFrame(null)}
          onConfirm={() => { const choice = pendingFrame; setPendingFrame(null); void confirmFrame(choice, true); }}
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
