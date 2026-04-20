"use client";

import { useGuestTrialStore } from "@/lib/guestTrialStore";

export function GuestTrialStartButton() {
  const showGuestTrialNotice = useGuestTrialStore((state) => state.showGuestTrialNotice);

  return (
    <button
      type="button"
      onClick={showGuestTrialNotice}
      className="inline-flex w-full items-center justify-center rounded-full border border-[color:var(--hc-border)] bg-[rgba(255,255,255,0.76)] px-5 py-3 text-sm font-semibold text-[color:var(--hc-text)] shadow-[0_12px_32px_rgba(37,99,235,0.08)] transition-all duration-300 ease-out hover:border-[rgba(37,99,235,0.28)] hover:bg-white sm:w-auto"
    >
      체험하기
    </button>
  );
}
