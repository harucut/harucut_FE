"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { josa } from "@harucut/shared";
import { useEffect, useRef, useState } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { getApiErrorDetails } from "@/lib/apiError";
import { describeComposeFailure } from "@/lib/fourcutCompose";
import { useGuestTrialStore, type GuestNoticeAction } from "@/lib/guestTrialStore";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { saveFourcutToServer } from "@/lib/fourcutProcessing";
import {
  ensurePendingGuestSaveComposeKey,
  readPendingGuestSave,
  clearPendingGuestSaveIfUnchanged,
  type PendingGuestSave,
  type PendingGuestSaveMeta,
  type PendingGuestSaveComposeKey,
} from "@/lib/pendingGuestSave";
import { resolveMembership } from "@/lib/authSession";

/**
 * 신호 없이 서버만 나은 경우를 메우려고 한 번 재는 시간.
 *
 * `resolveMembership()` 이 한 번 묻는 데 쓰는 상한과 같은 숫자다(lib/authSession.ts).
 * 새로 지어낸 간격이 아니라 「한 번 묻는 데 최대로 걸리는 만큼」이다.
 */
const MEMBERSHIP_TIMED_RETRY_MS = 30_000;
// 최초 읽기와 수동 재시도 두 번. 실패 횟수만으로 보관물을 자동 삭제하지 않는다.
const MAX_HANDOFF_READ_ATTEMPTS = 3;

/**
 * 다시 시도를 권할 때 붙이는 **중복 경고**. 멱등키를 못 남긴 기기에서만 붙는다.
 *
 * 「다시 하면 이어서 저장해요」는 보관물에 남은 멱등키가 있을 때만 참이다. 그 키를 못
 * 남긴 기기(IndexedDB 를 못 열거나 트랜잭션이 깨진 곳)에서는 다음 시도가 새 키로 접수돼
 * 서버가 앞 작업을 재생하지 못한다 — 첫 합성이 이미 접수된 뒤였다면 같은 네컷이 두 벌
 * 남는다. 다시 시도를 막지는 않되, 무엇이 달라지는지는 먼저 말한다.
 *
 * 붙는 자리가 둘이다(401 로 멈춘 자리 · 다시 해 볼 만한 실패). 문구를 두 곳에 적으면
 * 한쪽만 고쳐진다.
 */
const DUPLICATE_RISK_SUFFIX = (composeKey: PendingGuestSaveComposeKey) =>
  composeKey.persisted
    ? ""
    : " 다만 이 기기에는 진행 표시를 남기지 못해, 같은 네컷이 두 벌 저장될 수 있어요.";

/**
 * 확인 안내를 띄울 때 읽은 **그 보관물**인가.
 *
 * 지문은 `savedAt` 이다 — 보관물은 항상 한 벌이고, 새로 찍으면 `setPendingGuestSave` 가
 * 그때의 시각으로 통째로 갈아 끼운다(lib/pendingGuestSave.ts). 나머지는 안내 문구와 합성
 * 요청에 실제로 들어가는 값들이라 함께 본다.
 *
 * 일부러 빼는 것이 둘이다. **멱등키**는 인계 도중에 우리가 심으므로(같은 한 벌인데도
 * 달라진다), **원본 4장**은 수 MB 문자열이라 대조 비용만 들 뿐 같은 밀리초에 갈아 끼운
 * 다른 한 벌이 아닌 한 새로 걸리는 것이 없다.
 */
function isSameHandoff(
  a: PendingGuestSaveMeta,
  b: PendingGuestSaveMeta,
): boolean {
  if (a.recordId || b.recordId) {
    if (!a.recordId || a.recordId !== b.recordId) return false;
  } else {
    // ID가 없는 예전 localStorage 보관물은 원본 문자열까지 같아야 한다.
    // 메타만 있는 스냅샷이나 Blob은 이 경로로 삭제를 허가하지 않는다.
    if (!("sources" in a) || !("sources" in b)) return false;
    const left = a.sources;
    const right = b.sources;
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== 4 ||
      right.length !== 4 ||
      !left.every((source, index) => typeof source === "string" && source === right[index])
    ) return false;
  }
  return (
    a.savedAt === b.savedAt &&
    a.displayName === b.displayName &&
    a.frameId === b.frameId &&
    a.remoteFrameId === b.remoteFrameId &&
    a.outputFilter === b.outputFilter &&
    a.backgroundColor === b.backgroundColor
  );
}

/**
 * 보관물을 지운다 — **확인 안내에 걸어 둔 그 한 벌일 때만.** 지웠으면 true.
 *
 * 지우는 자리가 셋이다(인계 성공·다시 해도 소용없는 실패·버리기). 셋 다 사용자에게 물어본
 * 시점과 몇 초에서 1분 넘게 떨어져 있고, 그 사이 다른 탭에서 새로 찍으면 보관물은 통째로
 * 갈아 끼워진다. 그때 무조건 지우면 **사용자가 버리겠다고 한 적 없는 새 한 벌**이 사라진다 —
 * 원본 4장은 여기에만 있어서 되돌릴 방법이 없다.
 *
 * **판단은 보관소가 한다.** 저장소를 못 연 채 읽은 예전 localStorage 한 벌을 어떻게 다룰지
 * (그 키만 지우고 IndexedDB 는 건드리지 않는다)까지 `clearPendingGuestSaveIfUnchanged` 안에
 * 있다 — 여기서 다시 판단하면 지우는 세 자리 중 한 곳이 언젠가 틀린다. 우리가 주는 것은
 * 지문뿐이고, 받는 것은 「지웠다/바뀌었다/모르겠다」 셋이다.
 *
 * 「바뀌었다」와 「모르겠다」를 여기서는 둘 다 false 로 접는다 — 호출부가 할 일이 같기
 * 때문이다(안내 표식을 되돌려 다음 회차에 다시 묻는다).
 */
async function clearHandoffIfUnchanged(
  promptedEntry: PendingGuestSave,
): Promise<boolean> {
  const result = await clearPendingGuestSaveIfUnchanged((entry) =>
    isSameHandoff(entry, promptedEntry),
  );
  return result === "cleared";
}

export function GuestTrialBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrateGuestMode = useGuestTrialStore((state) => state.hydrateGuestMode);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const hydrated = useGuestTrialStore((state) => state.hydrated);
  const showGuestRestrictedNotice = useGuestTrialStore((state) => state.showGuestRestrictedNotice);
  const setNotice = useGuestTrialStore((state) => state.setNotice);

  useEffect(() => {
    hydrateGuestMode();
  }, [hydrateGuestMode]);

  // 비회원 때 만든 네컷을 로그인 후 기록에 남긴다.
  //
  // 보관해 둔 것은 완성본이 아니라 **원본 4장과 만드는 방법**이라(lib/pendingGuestSave.ts),
  // 여기서 회원과 똑같은 서버 합성을 돌린다. 비회원 때 브라우저가 그린 그림보다
  // 해상도가 오히려 좋아진다.
  //
  // 예전에는 `?resumeSave=1` 이 붙은 주소를 탈 때만 돌았다. 그런데 그 주소는 우리가
  // 만든 로그인 링크 하나에서만 나온다 — OAuth 콜백이 실패해 다시 로그인하거나, 앱을
  // 껐다 켜거나, 랜딩에서 로그인하면 보관물은 그대로 남은 채 영영 합성되지 않았다.
  // 지금은 **로그인이 확인되면 보관물이 있는지 본다.** resumeSave 는 주소만 정리한다.
  //
  // 다만 곧바로 올리지는 않는다. **저장 전에 물어본다** — 보관물에는 소유자 표식이 없고
  // 24시간을 산다. 비회원이 결과만 내려받고 기기를 넘기면, 그 뒤 아무나 로그인하는
  // 순간 앞사람 얼굴이 뒷사람 보관함에 자동으로 들어간다(공용 기기·가족 공용 태블릿).
  // 물어본 것과 실제로 올리는 것이 갈리지 않게, **누른 시점에 보관물을 다시 읽는다**
  // (아래 runPendingSave) — 안내를 열어 둔 사이 기한이 지나거나 갈아 끼워질 수 있다.
  const handoffPromptedRef = useRef(false);
  /**
   * 회원 판정의 결말을 **아직 못 받았는가.** 이 값이 켜져 있는 동안만 재시도 신호를 듣는다.
   *
   * 켜지는 때가 둘이다 — 판정이 **도는 중**이거나, `unknown` 으로 끝나 다시 물어야 할 때다.
   * 도는 중에도 켜 두는 이유는, 판정이 최대 30초까지 걸려서 그 사이에 회선이 돌아오거나
   * 탭으로 돌아오는 일이 실제로 일어나기 때문이다. 그 신호를 못 들으면 뒤이어 도착한
   * `unknown` 뒤에는 아무 신호도 남지 않아, 같은 화면에서 영영 다시 묻지 않는다.
   *
   * 답을 받으면(`member`·`guest`) 끈다. 늘 듣게 두면 답이 이미 정해진 사람에게도 탭을
   * 오갈 때마다 인증 왕복이 붙는다.
   */
  const [membershipWatch, setMembershipWatch] = useState(false);
  /** 회차마다 하나씩 올라가는 번호. 늦게 끝난 앞 회차가 뒤 회차의 상태를 지우지 않게 한다. */
  const membershipRoundRef = useRef(0);
  /**
   * 지금 도는 회차의 번호. `0` 이면 아무 판정도 안 돈다.
   *
   * 참·거짓이 아닌 **번호**인 이유: 화면이 바뀌면 앞 회차(A)는 취소 표시만 되고 요청 자체는
   * 계속 돈다. 뒤이어 시작한 B 가 도는 중에 A 가 끝나면서 이 자리를 「안 돈다」로 만들면,
   * 다음 신호가 B 와 겹치는 세 번째 왕복을 연다. 자기 번호일 때만 내린다.
   */
  const membershipInFlightRef = useRef(0);
  /** 판정이 도는 사이에 복구 신호가 왔는가. `unknown` 으로 끝나면 그 자리에서 한 번 더 돈다. */
  const recoverySignalRef = useRef(false);
  /** 판정을 다시 돌리는 손잡이. 아래 effect 의 의존성이라 값이 바뀌면 한 회차가 더 돈다. */
  const [membershipRetryToken, setMembershipRetryToken] = useState(0);
  /**
   * 시간을 재서 한 번 더 묻기로 걸어 둔 타이머. `0` 이면 재는 것이 없다.
   *
   * 브라우저 신호(`online`·`visibilitychange`)로는 못 잡는 실패가 하나 있다 — **서버만
   * 아팠던 경우**다. 5xx 나 상한에 걸린 요청도 `unknown` 으로 끝나는데, 그 서버가 나아도
   * 브라우저는 아무것도 알려 주지 않는다. 온라인인 채로 같은 화면에 머무르면 신호가
   * 영영 오지 않아 저장 안내가 사라진 채로 남는다.
   *
   * 상태가 아니라 ref 인 이유: 상태로 켜고 끄면 한 회차의 「접는다」와 다음 「건다」가 같은
   * 렌더로 묶여 서로를 지운다 — 접은 줄 알았던 앞 타이머가 그대로 살아 터진다.
   */
  const membershipTimerRef = useRef(0);
  /** 시간을 잰 되묻기를 이미 썼는가. **한 번뿐이다** — 아래에 그 이유를 적는다. */
  const membershipTimerUsedRef = useRef(false);
  /*
    저장이 도는 중인가.

    저장은 원본 4장을 다시 올리고 서버 합성을 기다리므로 1분이 넘기도 한다. 그 사이 화면을
    두 번 옮기면 아래 cleanup 이 `handoffPromptedRef` 를 되돌려 확인 안내가 되살아났다 —
    진행 중 안내를 덮고, 같은 인계가 한 번 더 접수돼 원본 4장이 S3 에 또 남는다.
  */
  const handoffSavingRef = useRef(false);
  const handoffReadFailuresRef = useRef(0);
  useEffect(() => {
    /*
      **쿠키를 읽기 전에는 판단하지 않는다.**

      스토어의 초깃값은 "member" 라, 위 hydrateGuestMode() 가 반영되기 전 첫 렌더에서는
      진짜 비회원도 회원으로 읽힌다. 체험 중인 사람에게 계정 저장을 물을 이유가 없다.
    */
    if (!hydrated || accessMode !== "member") return;

    /*
      주소 정리는 **부를 때의 주소**를 본다.

      이 함수는 확인 안내의 버튼에 실려 저장이 끝난 뒤(수십 초)에야 불린다. effect 가 잡아 둔
      pathname·searchParams 로 replace 하면, 그 사이 기록 화면으로 옮겨 간 사람이 저장이
      끝나는 순간 /home 으로 끌려간다 — replace 라 뒤로 가기로 돌아오지도 못한다.
    */
    const stripResumeParam = () => {
      const nextParams = new URLSearchParams(window.location.search);
      if (!nextParams.get("resumeSave")) return;
      nextParams.delete("resumeSave");
      const livePath = window.location.pathname;
      const nextSearch = nextParams.toString();
      router.replace(nextSearch ? `${livePath}?${nextSearch}` : livePath);
    };

    let cancelled = false;
    /** 확인 안내를 실제로 띄웠는가. 아래 cleanup 이 쓴다. */
    let prompted = false;

    /*
      버리기도 **되읽고 지운다.**

      안내를 열어 둔 사이 다른 탭에서 새로 찍으면 보관물이 통째로 갈아 끼워진다. 그때
      무조건 지우면 사용자가 버리겠다고 한 적 없는 새 한 벌이 사라지고, 원본 4장은 여기에만
      있어서 되돌릴 수 없다. 그런 경우에는 그대로 두고 다시 물어본다.
    */
    const discardPendingSave = async (promptedEntry: PendingGuestSaveMeta) => {
      if (handoffSavingRef.current) return;
      handoffSavingRef.current = true;
      const result = await clearPendingGuestSaveIfUnchanged((entry) =>
        isSameHandoff(entry, promptedEntry),
      );
      handoffSavingRef.current = false;
      if (result === "cleared") {
        stripResumeParam();
        return;
      }

      handoffPromptedRef.current = false;
      setNotice({
        actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
        eyebrow: "NOTICE",
        icon: "lock",
        message: result === "changed"
          ? "확인하는 사이 이 기기의 보관물이 다른 네컷으로 바뀌었어요. 버리겠다고 하신 것과 다른 사진이라 그대로 뒀어요. 새로 만든 것이라면 다시 물어볼게요."
          : "이 기기의 보관물을 확인하지 못해 버리지 않았어요. 다른 하루컷 탭을 닫고 이 화면을 새로고침한 뒤 다시 시도해 주세요.",
        title: "버리지 않았어요",
      });
    };

    const showUnreadableNotice = ({
      attempt,
      phase,
      reason,
      retry,
      promptedEntry,
    }: {
      attempt: number;
      phase: "read" | "compose-key";
      reason: "storage" | "sources" | "changed" | "unknown";
      retry: () => void;
      promptedEntry?: PendingGuestSaveMeta;
    }) => {
      const exhausted = attempt >= MAX_HANDOFF_READ_ATTEMPTS;
      // 사진, 표시 이름, 멱등키 등 보관 내용은 로그에 싣지 않는다.
      console.warn("count_unreadable_hand_off", { phase, reason, attempt });
      const actions: GuestNoticeAction[] = [];
      if (!exhausted) {
        actions.push({ id: "save-guest-handoff", label: "다시 시도", onSelect: retry });
      }
      if (promptedEntry) {
        actions.push({
          id: "discard-guest-handoff",
          label: "보관물 버리기",
          variant: "secondary",
          onSelect: () => setNotice({
            actions: [
              {
                id: "discard-guest-handoff",
                label: "버리기",
                onSelect: () => void discardPendingSave(promptedEntry),
              },
              { id: "dismiss", label: "보관물 유지", variant: "secondary" },
            ],
            eyebrow: "NOTICE",
            icon: "lock",
            message: `"${promptedEntry.displayName}"의 이 기기 보관본을 버리면 기록으로 옮길 수 없고 되돌릴 수도 없어요. 이미 내려받은 사진과 계정 기록은 그대로 남아요.`,
            title: "이 보관물을 버릴까요?",
          }),
        });
      }
      actions.push({
        id: "dismiss",
        label: promptedEntry ? "보관물 유지" : "닫기",
        variant: "secondary",
      });
      const message = reason === "changed"
        ? "확인하는 사이 이 기기의 보관물이 다른 네컷으로 바뀌었어요. 새 보관물은 그대로 두었어요."
        : promptedEntry
          ? "이 기기에 보관한 사진을 읽지 못했어요. 보관물은 지우지 않았고, 기록에도 옮기지 않았어요."
          : "이 기기의 사진 보관함을 확인하지 못했어요. 보관물이 있는지 아직 알 수 없어 기록으로 옮기지 않았어요.";
      setNotice({
        actions,
        eyebrow: "NOTICE",
        icon: "lock",
        message: `${message} ${exhausted
          ? "같은 문제가 반복되고 있어요. 다른 하루컷 탭을 닫고 앱이나 브라우저를 다시 열어 주세요. 원본 사진이 있다면 촬영 화면에서 다시 불러올 수도 있어요."
          : "다시 시도해 주세요. 같은 문제가 반복되면 다른 하루컷 탭을 닫고 앱이나 브라우저를 다시 열어 주세요."}`,
        title: reason === "changed"
          ? "보관물이 바뀌었어요"
          : exhausted ? "사진을 계속 읽지 못하고 있어요" : "사진을 읽지 못했어요",
      });
    };

    const runPendingSave = async (
      promptedEntry: PendingGuestSave,
      unreadableAttempts = 0,
    ) => {
      if (handoffSavingRef.current || unreadableAttempts >= MAX_HANDOFF_READ_ATTEMPTS) return;
      /*
        누른 즉시 "옮기는 중"이라고 말한다.

        이 일은 원본 4장을 다시 올리고 서버 합성이 끝날 때까지 기다린다 — 길면 1분이 넘는다
        (lib/composeApi.ts 의 폴링 상한은 의도된 값이라 줄이지 않는다). 그런데
        GuestTrialOverlay 는 콜백이 붙은 버튼을 누르면 안내를 **먼저 닫고** 콜백을 부르므로,
        그동안 화면에는 아무 표시도 없었다 — 눌렀는데 아무 일도 안 난 것처럼 보인다.
        첫 await 앞에서 동기적으로 걸어야 닫기와 같은 렌더에 묶여 모달이 깜빡이지 않는다.
      */
      handoffSavingRef.current = true;
      setNotice({
        actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
        eyebrow: "SAVING",
        icon: "sparkles",
        message:
          "비회원 때 만든 네컷을 기록으로 옮기고 있어요. 사진을 다시 올려 서버가 그리는 중이라 조금 걸릴 수 있어요 — 이 안내를 닫아도 계속 진행돼요.",
        title: "기록에 옮기고 있어요",
      });

      /*
        **누른 시점에 보관물을 다시 읽는다 — 멱등키를 붙이는 그 읽기 하나로.**

        이 안내는 사용자가 누를 때까지 열려 있다 — 기한(24시간)이 코앞일 때 띄워 두고 한참
        뒤에 누를 수 있고, 그 사이 다른 탭에서 새로 찍으면 보관물이 통째로 갈아 끼워진다.
        기한이 지났으면 `getPendingGuestSave` 가 읽으면서 지우고 null 을 주는데, 그런데도
        안내를 띄울 때 캡처해 둔 항목으로 합성을 계속하면 **하루 기한을 넘긴 사진이 계정
        기록에 들어간다** — 공용 기기에서 앞사람 것이 넘어가지 않게 한 TTL 이 여기서
        우회된다. 그래서 없거나 처음 확인한 것과 다르면 인계를 접는다.

        **읽기를 둘로 나누지 않는다.** 예전에는 여기서 한 번 읽어 대조하고
        `ensurePendingGuestSaveComposeKey()` 가 또 한 번 읽었는데, 그 사이에 보관물이
        갈아 끼워지면 키는 **새 한 벌**에 붙고 요청에는 **예전 한 벌**의 원본이 실렸다.
        조건부 삭제가 새 한 벌을 지키므로 그 한 벌은 살아남고, 나중에 그것을 인계할 때
        같은 키가 다시 나와 서버가 예전 작업을 재생한다 — 새로 찍은 네컷 대신 예전 것이
        저장된다. 그래서 읽기·대조·올릴 원본을 전부 그 한 번의 읽기에 묶는다.

        **원자적이지 않다.** IndexedDB 에 조건부 읽기는 없어서 이 읽기와 아래 업로드 사이는
        여전히 열려 있다. 하는 일은 안내를 띄운 순간부터 벌어져 있던 창을 그 두 줄 사이로
        줄이는 것뿐이다(lib/pendingTermsConsent.ts 의 `clearPendingTermsConsentIfUnchanged`
        와 같은 이유·같은 한계).
      */
      const composeKey = await ensurePendingGuestSaveComposeKey();
      if (composeKey === "unreadable") {
        handoffSavingRef.current = false;
        // 확인한 항목을 유지하고 버튼으로 재시도한다. 재시도도 위 읽기와 아래 대조를 거친다.
        const attempt = unreadableAttempts + 1;
        showUnreadableNotice({
          attempt,
          phase: "compose-key",
          reason: "unknown",
          promptedEntry,
          retry: () => void runPendingSave(promptedEntry, attempt),
        });
        return;
      }
      if (!composeKey || !isSameHandoff(composeKey.entry, promptedEntry)) {
        handoffSavingRef.current = false;
        // 물어본 것을 접었으니 "이미 물어봤다"도 되돌린다. 새 한 벌이 들어와 있으면
        // 다음 회차에 그것으로 다시 묻는다 — 갈아 끼운 쪽은 남의 것이 아니라 다음 인계다.
        handoffPromptedRef.current = false;
        // 아무 말 없이 닫으면 "눌렀는데 저장됐겠지"로 남는다. 안 옮겼다고 말한다.
        // 사라진 보관물은 이미 지워졌고, 새로 들어온 한 벌은 우리가 지울 것이 아니다.
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "NOTICE",
          icon: "lock",
          message: composeKey
            ? "확인하는 사이 이 기기의 보관물이 다른 네컷으로 바뀌었어요. 물어본 것과 다른 사진을 계정에 저장하지 않으려고 여기서 멈췄어요."
            : "확인하는 사이 이 기기의 보관물이 사라졌어요. 비회원 보관물은 24시간만 남아 있어요 — 기록에는 아무것도 옮기지 않았어요.",
          title: "기록에 옮기지 않았어요",
        });
        return;
      }

      // 키가 붙은 **그 한 벌**을 올린다. 이 함수가 읽어 온 것이라 대조를 통과한 것과
      // 같은 항목이다(위 주석).
      const entry = composeKey.entry;

      /*
        멱등키는 **보관물에 심어 두고 다시 쓴다.**

        이 인계는 서버 합성이 성공한 뒤에도 실패할 수 있다 — 폴링 시간 초과, 이름 바꾸기
        뒤의 URL 조회(lib/fourcutProcessing.ts). 그런 실패는 다시 해 볼 만한 것으로 보고
        보관물을 남기는데(아래 catch), 키 없이 다시 부르면 `composeFourcutOnServer` 가
        매번 새 키를 만들어 접수해서 **같은 네컷이 기록에 두 벌** 남는다. 같은 키면
        서버가 이미 만든 작업을 그대로 재생하므로 한 벌로 끝난다.

        재시도는 원본 4장을 S3 에 다시 올린다. 그 키들은 서버가 쳐다보지도 않고 예전 작업을
        재생하므로, 남는 원본 정리는 백엔드 몫이다(lib/fourcutCompose.ts 주석 참고).

        보관물이 사라졌으면 위에서 이미 접었다 — 여기까지 오면 키는 항상 있다.

        키를 **못 남기는** 경우는 있다(IndexedDB 를 못 열거나 트랜잭션이 깨진 기기).
        그때도 이번 합성은 그대로 되지만 새로고침 뒤에는 그 키를 찾을 수 없어, 다시 시도가
        같은 네컷을 한 벌 더 만든다. 그래서 `persisted` 를 아래 실패 안내에서 갈라 쓴다.
      */
      const idempotencyKey = composeKey.key;

      try {
        await saveFourcutToServer({
          sources: entry.sources,
          layout: FRAME_LAYOUTS[entry.frameId],
          outputFilter: entry.outputFilter,
          frameId: entry.frameId,
          remoteFrameId: entry.remoteFrameId,
          displayName: entry.displayName,
          idempotencyKey,
          // 비회원 때 고른 배경색 그대로 다시 그린다 — 빼면 서버가 프레임에 저장된
          // 배경으로 그려서, 방금 내려받아 본 그림과 색이 갈린다.
          backgroundColor: entry.backgroundColor,
        });
        // 올린 그 한 벌만 지운다. 합성이 도는 1분 사이에 다른 탭이 새로 찍어 갈아 끼웠으면
        // 그것은 아직 아무도 묻지 않은 인계다 — 여기서 지우면 소리 없이 사라진다.
        //
        // 못 지웠으면 **다시 물어야 한다.** 남아 있는 한 벌은 우리가 방금 올린 것이 아니라
        // 새로 들어온 인계인데, "이미 물어봤다" 표식을 그대로 두면 다음 회차가 통째로
        // 건너뛴다 — 새로고침하거나 앱을 다시 열기 전까지 그 한 벌을 옮길 수 없다.
        if (!(await clearHandoffIfUnchanged(entry))) {
          handoffPromptedRef.current = false;
        }
        stripResumeParam();
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "SAVED",
          icon: "check",
          message:
            "비회원 때 만든 네컷을 기록에 저장했어요. 기록 화면에서 다시 보거나 내려받을 수 있어요.",
          title: "기록에 저장됐어요",
        });
      } catch (error) {
        console.error(error);

        // 올리는 사이에 세션이 끊긴 것뿐이면 실패라고 말하지 않는다. 보관물은 남기고
        // 다시 로그인하면 이어 간다 — 여기서 "저장을 완료하지 못했어요"라고 쓰면
        // 멀쩡한 결과물을 잃은 줄 알게 된다.
        if (getApiErrorDetails(error).status === 401) {
          setNotice({
            actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
            eyebrow: "NOTICE",
            icon: "lock",
            // 이쪽도 「다시 하면 이어서」를 약속한다. 키를 못 남긴 기기에서는 그 약속이
            // 중복 한 벌을 뜻하므로(아래 재시도 자리와 같은 이유) 여기서도 갈라 말한다 —
            // 서버 합성이 끝난 뒤 이름·URL 조회에서 401 이 날 수 있어서, 다음 로그인의
            // 재시도가 새 키로 같은 네컷을 한 벌 더 만든다.
            message: `로그인이 풀려서 아직 옮기지 못했어요. 보관해 둔 결과는 그대로 있으니 다시 로그인하면 이어서 저장할게요.${DUPLICATE_RISK_SUFFIX(composeKey)}`,
            title: "로그인하면 이어서 저장할게요",
          });
          return;
        }

        // 다시 해도 소용없는 실패(없는 프레임, 서버가 못 읽는 자산, 요금제)에서는
        // 보관물을 버린다. 남겨 두면 새로고침할 때마다 원본 4장을 S3 에 다시 올리고
        // 또 실패하는 무한 루프가 된다 — 예전에는 종류를 안 가리고 "새로고침하면
        // 다시 시도해요"라고만 안내했다.
        const failure = describeComposeFailure(error);
        if (!failure.retryable) {
          // 버리는 것도 **내가 올린 그 한 벌일 때만**이다(위 성공 자리와 같은 이유).
          // 못 지웠으면 남은 한 벌을 다음 회차에 다시 묻는다.
          if (!(await clearHandoffIfUnchanged(entry))) {
            handoffPromptedRef.current = false;
          }
          stripResumeParam();
        }

        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "NOTICE",
          icon: "lock",
          message: failure.retryable
            ? `${failure.message} 이 화면을 새로고침하면 다시 시도해요.${DUPLICATE_RISK_SUFFIX(composeKey)}`
            : `${failure.message} 비회원 때 만든 결과는 기록에 옮기지 못했어요.`,
          title: "저장을 완료하지 못했어요",
        });
      } finally {
        handoffSavingRef.current = false;
      }
    };

    /*
      한 회차를 돌리고 **신호를 계속 들을지**를 돌려준다.

      `true` 는 「아직 못 물어봤다」 하나뿐이다. 답을 받았든(회원·비회원) 물어볼 일이
      없었든(보관물이 사라졌든 이미 물었든) 전부 `false` 다 — 그래도 듣고 있으면 탭을
      오갈 때마다 IndexedDB 를 다시 읽고 판정을 다시 건다.

      끄는 자리를 갈래마다 두지 않고 이 함수의 **반환값 하나**로 모은 이유다. 갈래마다
      두면 하나가 죽어도 아무도 모른다.
    */
    const runRound = async (): Promise<boolean> => {
      // 보관물 조회는 비동기다 — IndexedDB 에 담기 때문이다(lib/pendingGuestSave.ts).
      // 읽는 동안 화면을 옮겼으면 여기서 끝낸다.
      const read = await readPendingGuestSave();
      if (cancelled) return false;
      if (read.status === "empty") {
        handoffReadFailuresRef.current = 0;
        stripResumeParam();
        return false;
      }

      // 한 번 물었으면 같은 탭에서 다시 걸지 않는다(성공·실패 모두 아래에서 정리한다).
      // 저장이 도는 중이면 더더욱 걸지 않는다 — 진행 중 안내를 덮고 같은 인계를 또 접수한다.
      if (handoffPromptedRef.current || handoffSavingRef.current) return false;
      handoffPromptedRef.current = true;

      /*
        쿠키가 아니라 서버에 묻는다. 로그아웃한 방문자에게 남의 결과물을 저장할지
        물어봐서는 안 되고, 물어본들 401 로 끝난다.

        **게스트 쿠키가 없다는 것은 "로그인했다"가 아니다.** accessMode 는 프론트가 심는
        `harucut_guest_trial` 쿠키 하나만 보므로(lib/guestTrialStore.ts), 로그아웃한 방문자도
        세션이 끊긴 방문자도 전부 "member" 로 읽힌다.

        묻는 것은 `resolveMembership()` 이다 — 생 `/api/auth/session` 이 아니다. 그 라우트는
        만료된 access 를 **재발급해 주지 않고** `authenticated: false` 로 감싸므로,
        access 만 만료되고 refresh 는 멀쩡한 회원이 비회원으로 읽힌다. 그러면 이 인계가
        묶이고, 아래에서 `handoffPromptedRef` 를 이미 세워 둔 탓에 같은 화면에서는 다시
        묻지도 않는다 — 다른 API 가 곧 토큰을 되살려도 새로고침 전까지 그대로다.

        **못 물어봤으면(`unknown`) 다시 물을 길을 열어 둔다.** 서버가 잠깐 흔들린 것뿐인데
        「이미 물어봤다」로 남으면 이번 화면에서 인계가 통째로 사라진다.

        아래 cleanup 이 「묻지 못하고 끝난 회차」의 표식을 되돌리지만, 그것은 **effect 가 다시
        돌 때**(주소가 바뀌거나 언마운트될 때)만 실행된다. 같은 화면에 머무르면 서버가
        회복돼도 아무 일도 일어나지 않는다. 그래서 여기서 **다시 물어볼 신호를 켠다**
        (아래 `membershipWatch`) — 회선이 돌아오거나 탭으로 돌아올 때 한 회차가 더 돈다.
        표식을 여기서 따로 되돌리지는 않는다: 그 회차가 시작될 때 cleanup 이 먼저 돌아
        이미 되돌린다. 두 자리에서 같은 일을 하면 어느 쪽이 살아 있는지 알 수 없게 된다.
      */
      // 판정이 도는 동안에도 복구 신호를 듣는다(아래 `membershipWatch`).
      const roundId = (membershipRoundRef.current += 1);
      membershipInFlightRef.current = roundId;
      recoverySignalRef.current = false;
      setMembershipWatch(true);

      const membership = await resolveMembership();
      // **내 번호일 때만 내린다.** 화면이 바뀌어 다음 회차가 이미 돌고 있으면 그 회차의
      // 것이다 — 여기서 지우면 다음 신호가 겹치는 왕복을 연다.
      if (membershipInFlightRef.current === roundId) {
        membershipInFlightRef.current = 0;
      }
      if (cancelled) return false;

      if (membership !== "member") {
        if (membership === "unknown") {
          if (recoverySignalRef.current) {
            /*
              도는 사이에 신호가 왔으면 그 신호는 이 답보다 새 소식이다 — 바로 한 번 더 묻는다.
              기록은 여기서 되돌리지 않는다: 이 bump 가 여는 다음 회차의 시작이 먼저 지운다.
              두 자리에서 같은 기록을 지우면 어느 쪽이 살아 있는지 알 수 없게 된다.
            */
            setMembershipRetryToken((token) => token + 1);
          } else if (!membershipTimerUsedRef.current) {
            /*
              **신호가 오지 않는 실패 하나를 위해, 딱 한 번 시간을 잰다.**

              브라우저는 「서버가 나았다」를 알려 주지 않는다. 회선도 탭도 그대로인 채
              서버만 아팠다 낫는 경우, 위 두 신호는 끝내 오지 않는다.

              **되풀이하지 않는 이유.** 간격도 횟수도 근거 없는 숫자가 되고, 장애가 길어지면
              같은 장애에 요청만 쌓인다. 재는 30초는 `resolveMembership()` 이 한 번 묻는 데
              쓰는 상한과 같은 숫자다 — 한 번 묻는 데 최대로 걸리는 만큼 기다렸다 한 번 더
              묻는다. 그래도 못 잡은 장애는 화면을 옮기거나 신호가 올 때 잡힌다.

              걸어 둔 타이머는 아래 cleanup 이 접는다 — 신호가 먼저 와서 한 회차가 이미
              돌았는데 타이머까지 터지면 같은 것을 묻는 왕복이 하나 더 붙는다.
            */
            membershipTimerUsedRef.current = true;
            membershipTimerRef.current = window.setTimeout(() => {
              setMembershipRetryToken((token) => token + 1);
            }, MEMBERSHIP_TIMED_RETRY_MS);
          }
        }
        return membership === "unknown";
      }

      prompted = true;
      if (read.status === "unreadable") {
        handoffReadFailuresRef.current += 1;
        showUnreadableNotice({
          attempt: handoffReadFailuresRef.current,
          phase: "read",
          reason: read.reason ?? "storage",
          promptedEntry: read.meta,
          retry: () => {
            handoffPromptedRef.current = false;
            setMembershipRetryToken((token) => token + 1);
          },
        });
        return false;
      }
      handoffReadFailuresRef.current = 0;
      const pending = read.entry;
      setNotice({
        actions: [
          {
            id: "save-guest-handoff",
            label: "이 계정에 저장하기",
            onSelect: () => void runPendingSave(pending),
          },
          {
            id: "discard-guest-handoff",
            label: "버리기",
            variant: "secondary",
            onSelect: () => void discardPendingSave(pending),
          },
        ],
        eyebrow: "NOTICE",
        icon: "check",
        message: `이 기기에 비회원으로 만든 "${pending.displayName}"${josa(pending.displayName, "이/가")} 남아 있어요. 지금 로그인한 계정 기록에 저장할까요? 내가 만든 것이 아니면 버려 주세요.`,
        title: "비회원 때 만든 네컷이 남아 있어요",
      });
      return false;
    };

    void (async () => {
      const keepWatching = await runRound();
      // 화면이 바뀌었으면 이 회차의 판단으로 다음 회차의 상태를 덮지 않는다.
      if (cancelled) return;
      setMembershipWatch(keepWatching);
    })();

    return () => {
      cancelled = true;
      // 이 회차가 걸어 둔 시간 재기를 접는다. 다음 회차가 그 일을 대신한다.
      window.clearTimeout(membershipTimerRef.current);
      // 물어보지도 못하고 끊겼으면 "이미 물어봤다"로 남기지 않는다. 로그인 확인이
      // 끝나기 전에 화면을 옮기면 이 자리에서 보관물이 영영 방치된다.
      // 저장이 도는 중이면 되돌리지 않는다 — 되돌리면 다음 화면에서 확인 안내가 되살아난다.
      if (!prompted && !handoffSavingRef.current) handoffPromptedRef.current = false;
    };
  }, [
    accessMode,
    hydrated,
    membershipRetryToken,
    pathname,
    router,
    searchParams,
    setNotice,
  ]);

  /*
    **판정의 결말을 못 받은 동안, 상황이 달라졌다는 신호에 다시 묻는다.**

    시간을 재서 되풀이하지 않는다 — 간격도 횟수도 지어낸 숫자가 되고, 같은 장애에 요청만
    쌓인다. 대신 브라우저가 알려 주는 두 신호만 듣는다: 회선이 돌아왔을 때(`online`)와
    이 탭으로 돌아왔을 때(`visibilitychange`). 둘 다 「아까와 달라졌을 수 있다」는 뜻이다.

    듣는 것은 **판정이 도는 중이거나 `unknown` 으로 끝났을 때**뿐이다(위 `membershipWatch`).
    늘 듣게 두면 탭을 오갈 때마다 판정이 다시 돌아 이미 답을 받은 화면에 헛왕복이 붙는다.
  */
  useEffect(() => {
    if (!membershipWatch) return;
    /*
      **회원 판정 대상일 때만 듣는다.** 위 판정 effect 와 같은 조건이다 — `unknown` 으로
      감시가 켜진 뒤 체험을 시작하면(`enterGuestMode()`) 그 effect 는 여기서 곧장 돌아
      나오는데, 이 리스너만 남으면 아무것도 판정하지 않으면서 신호마다 손잡이를 올려
      앱이 열린 내내 헛렌더가 붙는다.
    */
    if (!hydrated || accessMode !== "member") return;

    const retry = () => {
      if (document.visibilityState === "hidden") return;
      /*
        판정이 **도는 중**이면 지금 다시 돌리지 않는다 — 같은 질문을 둘로 만들 뿐이다.
        기록만 해 두고, 그 판정이 `unknown` 으로 끝나면 그때 한 번 더 돈다.
      */
      if (membershipInFlightRef.current !== 0) {
        recoverySignalRef.current = true;
        return;
      }
      // 감시를 여기서 끄지 않는다 — 끌지 말지는 이 회차의 답이 정한다(위 판정 직후 한 자리).
      setMembershipRetryToken((token) => token + 1);
    };

    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [accessMode, hydrated, membershipWatch]);


  // guestNotice 쿼리를 만드는 곳은 proxy.ts의 게스트 리다이렉트 하나뿐이고 값도 "restricted"만 쓴다.
  // 공유/저장 안내는 URL이 아니라 화면에서 직접 스토어 액션을 부른다(shoot/result 등).
  useEffect(() => {
    const guestNotice = searchParams.get("guestNotice");
    if (!guestNotice) {
      return;
    }

    if (guestNotice === "restricted") {
      showGuestRestrictedNotice();
    }

    // 값이 무엇이든 파라미터는 걷어내 URL을 원래대로 되돌린다.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("guestNotice");
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }, [pathname, router, searchParams, showGuestRestrictedNotice]);

  return <GuestTrialOverlay />;
}
