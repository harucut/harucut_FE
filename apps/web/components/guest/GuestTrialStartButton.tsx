"use client";

import { useGuestTrialStore } from "@/lib/guestTrialStore";

export function GuestTrialStartButton() {
  const showGuestTrialNotice = useGuestTrialStore((state) => state.showGuestTrialNotice);

  return (
    <button
      type="button"
      onClick={showGuestTrialNotice}
      className="hc-button-secondary inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold transition-all duration-300 ease-out sm:w-auto"
    >
      체험하기
    </button>
  );
}
