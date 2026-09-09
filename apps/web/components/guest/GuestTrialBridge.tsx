"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { josa } from "@harucut/shared";
import { useEffect, useRef } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { getApiErrorDetails } from "@/lib/apiError";
import { describeComposeFailure } from "@/lib/fourcutCompose";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { saveFourcutToServer } from "@/lib/fourcutProcessing";
import {
  clearPendingGuestSave,
  ensurePendingGuestSaveComposeKey,
  getPendingGuestSave,
  readPendingGuestSaveForClear,
  type PendingGuestSave,
  type PendingGuestSaveComposeKey,
} from "@/lib/pendingGuestSave";

/**
 * 로그인했는지 서버에 묻는다.
 *
 * **게스트 쿠키가 없다는 것은 "로그인했다"가 아니다.** accessMode 는 프론트가 심는
 * `harucut_guest_trial` 쿠키 하나만 보므로(lib/guestTrialStore.ts), 로그아웃한 방문자도
 * 세션이 끊긴 방문자도 전부 "member" 로 읽힌다. 그 값으로 인증 전용 서버 합성을 부르면
 * 401 이 나고, 화면에는 "저장을 완료하지 못했어요" 라는 거짓 실패가 뜬다. 보관물은
 * 남으므로 하루 동안 페이지를 열 때마다 같은 안내가 반복된다.
 *
 * 세션 유효성은 백엔드에 위임한다는 규칙이 이미 있다(app/api/auth/session/route.ts).
 * 조회에 실패하면 아무것도 하지 않는다 — 보관물은 그대로 남고 다음 기회에 다시 묻는다.
 */
async function isSignedIn() {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    return Boolean(
      ((await res.json()) as { authenticated?: boolean }).authenticated,
    );
  } catch {
    return false;
  }
}

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
function isSameHandoff(a: PendingGuestSave, b: PendingGuestSave): boolean {
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
 * 없어진 뒤라면 지우는 김에 예전 localStorage 보관물까지 걷어내고 true 로 끝낸다 —
 * 사용자가 원한 상태가 이미 됐다는 뜻이다.
 *
 * **못 읽었으면 지우지 않는다.** 저장소를 못 열거나 읽다 깨지면 레코드가 멀쩡히 있어도
 * 조회는 빈손으로 돌아온다. 그것을 「이미 없다」로 읽으면, 합성이 도는 사이 다른 탭이
 * 새로 찍어 둔 한 벌을 — 사용자가 확인한 적 없는 것을 — 그대로 지운다. 두 번째 열기만
 * 성공하면 원본 4장이 사라지고, 이 함수가 막으려던 사고가 바로 그 자리에서 난다.
 * 그래서 삭제를 물을 때는 `readPendingGuestSaveForClear` 를 부른다 — 저장소를 못 연 채
 * 읽은 예전 localStorage 한 벌까지 「모르겠다」로 접어 주는 쪽이다. 인계를 꺼낼 때 쓰는
 * `readPendingGuestSave` 는 그 한 벌을 `found`(`opened: false`)로 주는데, 그 답을 삭제
 * 근거로 쓰면 IndexedDB 를 한 번도 못 읽은 채 지우게 된다.
 *
 * **원자적이지 않다.** IndexedDB 에 조건부 삭제는 없어서 되읽기와 삭제 사이는 여전히
 * 열려 있다 — 안내를 띄운 순간부터 벌어져 있던 창을 두 줄 사이로 줄이는 것뿐이다
 * (lib/pendingTermsConsent.ts 의 `clearPendingTermsConsentIfUnchanged` 와 같은 한계).
 */
async function clearHandoffIfUnchanged(
  promptedEntry: PendingGuestSave,
): Promise<boolean> {
  const read = await readPendingGuestSaveForClear();
  if (read.status === "unreadable") return false;
  if (read.status === "found" && !isSameHandoff(read.entry, promptedEntry))
    return false;
  await clearPendingGuestSave();
  return true;
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
  /*
    저장이 도는 중인가.

    저장은 원본 4장을 다시 올리고 서버 합성을 기다리므로 1분이 넘기도 한다. 그 사이 화면을
    두 번 옮기면 아래 cleanup 이 `handoffPromptedRef` 를 되돌려 확인 안내가 되살아났다 —
    진행 중 안내를 덮고, 같은 인계가 한 번 더 접수돼 원본 4장이 S3 에 또 남는다.
  */
  const handoffSavingRef = useRef(false);
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
    const discardPendingSave = async (promptedEntry: PendingGuestSave) => {
      if (await clearHandoffIfUnchanged(promptedEntry)) {
        stripResumeParam();
        return;
      }

      handoffPromptedRef.current = false;
      setNotice({
        actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
        eyebrow: "NOTICE",
        icon: "lock",
        message:
          "확인하는 사이 이 기기의 보관물이 다른 네컷으로 바뀌었어요. 버리겠다고 하신 것과 다른 사진이라 그대로 뒀어요 — 새로 만든 것이라면 다시 물어볼게요.",
        title: "버리지 않았어요",
      });
    };

    const runPendingSave = async (promptedEntry: PendingGuestSave) => {
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

    void (async () => {
      // 보관물 조회는 비동기다 — IndexedDB 에 담기 때문이다(lib/pendingGuestSave.ts).
      // 읽는 동안 화면을 옮겼으면 여기서 끝낸다.
      const pending = await getPendingGuestSave();
      if (cancelled) return;
      if (!pending) {
        stripResumeParam();
        return;
      }

      // 한 번 물었으면 같은 탭에서 다시 걸지 않는다(성공·실패 모두 아래에서 정리한다).
      // 저장이 도는 중이면 더더욱 걸지 않는다 — 진행 중 안내를 덮고 같은 인계를 또 접수한다.
      if (handoffPromptedRef.current || handoffSavingRef.current) return;
      handoffPromptedRef.current = true;

      // 쿠키가 아니라 서버에 묻는다. 로그아웃한 방문자에게 남의 결과물을 저장할지
      // 물어봐서는 안 되고, 물어본들 401 로 끝난다.
      const signedIn = await isSignedIn();
      if (cancelled || !signedIn) return;

      prompted = true;
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
    })();

    return () => {
      cancelled = true;
      // 물어보지도 못하고 끊겼으면 "이미 물어봤다"로 남기지 않는다. 로그인 확인이
      // 끝나기 전에 화면을 옮기면 이 자리에서 보관물이 영영 방치된다.
      // 저장이 도는 중이면 되돌리지 않는다 — 되돌리면 다음 화면에서 확인 안내가 되살아난다.
      if (!prompted && !handoffSavingRef.current) handoffPromptedRef.current = false;
    };
  }, [accessMode, hydrated, pathname, router, searchParams, setNotice]);

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
