"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

export function GuestTrialBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrateGuestMode = useGuestTrialStore((state) => state.hydrateGuestMode);
  const showGuestRestrictedNotice = useGuestTrialStore((state) => state.showGuestRestrictedNotice);
  const showGuestShareNotice = useGuestTrialStore((state) => state.showGuestShareNotice);
  const showGuestSavedNotice = useGuestTrialStore((state) => state.showGuestSavedNotice);

  useEffect(() => {
    hydrateGuestMode();
  }, [hydrateGuestMode]);

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
