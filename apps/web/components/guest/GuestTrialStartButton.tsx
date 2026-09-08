"use client";

import type { ReactNode } from "react";
import { GUEST_TRIAL_CTA_LABEL } from "@harucut/shared";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

const DEFAULT_CLASS =
  "hc-button-secondary inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold sm:w-auto";

export function GuestTrialStartButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const showGuestTrialNotice = useGuestTrialStore((state) => state.showGuestTrialNotice);

  return (
    <button
      type="button"
      onClick={showGuestTrialNotice}
      className={className ?? DEFAULT_CLASS}
    >
      {children ?? GUEST_TRIAL_CTA_LABEL}
    </button>
  );
}
