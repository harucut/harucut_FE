"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
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
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (!searchParams.get("resumeSave")) {
      // resumeSave가 사라지면 가드를 풀어, 같은 탭에서 이후의 또 다른 보류 저장도 처리되게 한다.
      resumeHandledRef.current = false;
      return;
    }
    if (resumeHandledRef.current) return;
    resumeHandledRef.current = true;

    const stripResumeParam = () => {
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
        // 실패 시 resumeSave/pending 을 그대로 둬 새로고침하면 다시 시도되게 한다.
        // 이제는 될 수 있는 시도라 재시도가 의미 있다(예전엔 405 라 무한 반복이었다).
        console.error(error);
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "NOTICE",
          icon: "lock",
          message: "저장을 마치지 못했어요. 이 화면을 새로고침하면 자동으로 다시 시도해요.",
          title: "저장을 완료하지 못했어요",
        });
      }
    })();
  }, [pathname, router, searchParams, setNotice]);

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
