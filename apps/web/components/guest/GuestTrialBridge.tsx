"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { uploadGeneratedFourcutFile } from "@/lib/fourcutProcessing";
import {
  clearPendingGuestSave,
  dataUrlToFile,
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

  // 비회원 저장(보류) → 로그인/회원가입 완료 후 /home?resumeSave=1 로 돌아오면
  // 보관해 둔 결과물을 서버(기록)에 자동 업로드한다.
  // 파라미터 제거로 effect가 재실행돼도 ref 가드로 1회만 처리하고, 업로드는 cancel하지 않아
  // 완료 후 localStorage 정리/알림이 반드시 실행되게 한다(중복 업로드 방지).
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (!searchParams.get("resumeSave")) {
      // resumeSave가 사라지면 가드를 풀어, 같은 탭에서 이후의 또 다른 보류 저장도 처리되게 한다.
      resumeHandledRef.current = false;
      return;
    }
    if (resumeHandledRef.current) return;
    resumeHandledRef.current = true;

    // 성공(또는 보류 없음)일 때만 resumeSave를 제거한다. 업로드 실패 시에는
    // 파라미터와 pending을 유지해, 새로고침/재진입 시 자동으로 다시 시도되게 한다(결과 유실 방지).
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
        const file = dataUrlToFile(
          pending.dataUrl,
          `${pending.displayName}.png`,
        );
        await uploadGeneratedFourcutFile({
          file,
          displayName: pending.displayName,
        });
        clearPendingGuestSave();
        stripResumeParam();
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "SAVED",
          icon: "check",
          message:
            "비회원 때 꾸민 네컷을 기록에 저장했어요. 기록 화면에서 다시 보거나 내려받을 수 있어요.",
          title: "기록에 저장됐어요",
        });
      } catch (error) {
        // 실패 시 resumeSave/pending을 그대로 둬 새로고침 시 자동 재시도되게 한다.
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
