"use client";

import type { ReactNode } from "react";
import { GUEST_TRIAL_CTA_LABEL } from "@harucut/shared";
import { PUBLIC_SHOOT_ENTRY } from "@/lib/guestTrialShared";

const DEFAULT_CLASS =
  "hc-button-secondary inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold sm:w-auto";

// 일반 링크로 진입해야 프록시가 심은 체험 쿠키를 새 문서가 읽는다.
export function GuestTrialStartButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={PUBLIC_SHOOT_ENTRY}
      className={className ?? DEFAULT_CLASS}
    >
      {children ?? GUEST_TRIAL_CTA_LABEL}
    </a>
  );
}
