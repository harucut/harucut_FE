"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
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
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);
  const setNotice = useGuestTrialStore((state) => state.setNotice);

  useEffect(() => {
    hydrateGuestMode();
  }, [hydrateGuestMode]);

  // 비회원 저장(보류) → 로그인/회원가입 완료 후 /home?resumeSave=1 로 돌아오면
  // 보관해 둔 결과물을 서버(기록)에 자동 업로드한다.
  useEffect(() => {
    if (!searchParams.get("resumeSave")) return;

    // 중복 실행 방지를 위해 파라미터를 즉시 제거한다.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("resumeSave");
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);

    const pending = getPendingGuestSave();
    if (!pending) return;

    let cancelled = false;
    void (async () => {
      try {
        const file = dataUrlToFile(
          pending.dataUrl,
          `${pending.displayName}.png`,
        );
        await uploadGeneratedFourcutFile({
          file,
          kind: "IMAGE",
          displayName: pending.displayName,
          extension: "png",
        });
        if (cancelled) return;
        clearPendingGuestSave();
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "SAVED",
          icon: "check",
          message:
            "비회원 때 꾸민 네컷을 기록에 저장했어요. 기록 화면에서 다시 보거나 내려받을 수 있어요.",
          title: "기록에 저장됐어요",
        });
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setNotice({
          actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
          eyebrow: "NOTICE",
          icon: "lock",
          message: "저장을 마치지 못했어요. 잠시 후 기록 화면에서 다시 시도해 주세요.",
          title: "저장을 완료하지 못했어요",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams, setNotice]);

  useEffect(() => {
    const guestNotice = searchParams.get("guestNotice");
    if (!guestNotice) {
      return;
    }

    if (guestNotice === "restricted") {
      showGuestRestrictedNotice();
    } else if (guestNotice === "share-only") {
      showGuestShareNotice();
    } else if (guestNotice === "saved") {
      showGuestSavedNotice();
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("guestNotice");
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }, [
    pathname,
    router,
    searchParams,
    showGuestRestrictedNotice,
    showGuestSavedNotice,
    showGuestShareNotice,
  ]);

  return <GuestTrialOverlay />;
}
