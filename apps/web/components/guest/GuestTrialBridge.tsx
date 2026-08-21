"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { describeComposeFailure } from "@/lib/fourcutCompose";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { saveFourcutToServer } from "@/lib/fourcutProcessing";
import {
  clearPendingGuestSave,
  getPendingGuestSave,
} from "@/lib/pendingGuestSave";

export function GuestTrialBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrateGuestMode = useGuestTrialStore((state) => state.hydrateGuestMode);
  const accessMode = useGuestTrialStore((state) => state.accessMode);
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
  // 지금은 **회원이 된 순간 보관물이 있으면** 처리한다. resumeSave 는 주소만 정리한다.
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (accessMode !== "member") return;

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

    // 한 번 시작했으면 같은 탭에서 다시 걸지 않는다(성공·실패 모두 아래에서 정리한다).
    if (resumeHandledRef.current) return;
    resumeHandledRef.current = true;

    void (async () => {
      try {
        await saveFourcutToServer({
          sources: pending.sources,
          layout: FRAME_LAYOUTS[pending.frameId],
          outputFilter: pending.outputFilter,
          frameId: pending.frameId,
          remoteFrameId: pending.remoteFrameId,
          displayName: pending.displayName,
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
    })();
  }, [accessMode, pathname, router, searchParams, setNotice]);

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
