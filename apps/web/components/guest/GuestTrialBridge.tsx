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
  getPendingGuestSave,
  type PendingGuestSave,
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
  const handoffPromptedRef = useRef(false);
  useEffect(() => {
    /*
      **쿠키를 읽기 전에는 판단하지 않는다.**

      스토어의 초깃값은 "member" 라, 위 hydrateGuestMode() 가 반영되기 전 첫 렌더에서는
      진짜 비회원도 회원으로 읽힌다. 체험 중인 사람에게 계정 저장을 물을 이유가 없다.
    */
    if (!hydrated || accessMode !== "member") return;

    const stripResumeParam = () => {
      if (!searchParams.get("resumeSave")) return;
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("resumeSave");
      const nextSearch = nextParams.toString();
      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
    };

    const pending = getPendingGuestSave();
    if (!pending) {
      stripResumeParam();
      return;
    }

    // 한 번 물었으면 같은 탭에서 다시 걸지 않는다(성공·실패 모두 아래에서 정리한다).
    if (handoffPromptedRef.current) return;
    handoffPromptedRef.current = true;

    let cancelled = false;
    /** 확인 안내를 실제로 띄웠는가. 아래 cleanup 이 쓴다. */
    let prompted = false;

    const runPendingSave = async (entry: PendingGuestSave) => {
      try {
        await saveFourcutToServer({
          sources: entry.sources,
          layout: FRAME_LAYOUTS[entry.frameId],
          outputFilter: entry.outputFilter,
          frameId: entry.frameId,
          remoteFrameId: entry.remoteFrameId,
          displayName: entry.displayName,
          // 비회원 때 고른 배경색 그대로 다시 그린다 — 빼면 서버가 프레임에 저장된
          // 배경으로 그려서, 방금 내려받아 본 그림과 색이 갈린다.
          backgroundColor: entry.backgroundColor,
        });
        clearPendingGuestSave();
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
            message:
              "로그인이 풀려서 아직 옮기지 못했어요. 보관해 둔 결과는 그대로 있으니 다시 로그인하면 이어서 저장할게요.",
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
          clearPendingGuestSave();
          stripResumeParam();
        }

        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "NOTICE",
          icon: "lock",
          message: failure.retryable
            ? `${failure.message} 이 화면을 새로고침하면 다시 시도해요.`
            : `${failure.message} 비회원 때 만든 결과는 기록에 옮기지 못했어요.`,
          title: "저장을 완료하지 못했어요",
        });
      }
    };

    void (async () => {
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
            onSelect: () => {
              clearPendingGuestSave();
              stripResumeParam();
            },
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
      if (!prompted) handoffPromptedRef.current = false;
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
