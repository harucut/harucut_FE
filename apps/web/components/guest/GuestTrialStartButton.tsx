"use client";

import type { ReactNode } from "react";
import { GUEST_TRIAL_CTA_LABEL } from "@harucut/shared";
import { usePublicShootCta } from "@/lib/usePublicShootCta";

const DEFAULT_CLASS =
  "hc-button-secondary inline-flex w-full items-center justify-center rounded-full border px-5 py-3 text-sm font-semibold sm:w-auto";

/*
  체험 안내를 띄우기 전에 **누른 사람이 이미 회원인지** 본다.

  이 버튼은 공개 랜딩의 주 CTA 라 로그인한 사람에게도 그대로 눌린다. 안내를 먼저 띄우면
  확인 한 번에 `enterGuestMode()` 가 7일짜리 게스트 쿠키를 심고, 그때부터 `/shoot` 은 저장
  프레임을 감추고 결과를 서버 기록 대신 브라우저에서만 합성한다. `/login` 도 유효 세션을 보고
  `/home` 으로 되돌려 보내므로, 명시적으로 로그아웃했다 다시 로그인하기 전까지 회원 기능으로
  못 돌아온다 — 회원 상태를 게스트로 덮어쓰는 셈이다.

  판정은 `usePublicShootCta` 하나에 둔다(하단 탭바의 촬영 탭이 이미 쓰는 것이다).
  인증 쿠키가 httpOnly 라 클라이언트가 못 읽으므로 `/api/auth/status` 왕복이 유일한 길이고,
  그 왕복을 두 곳에 따로 적으면 갈라진다.
*/
export function GuestTrialStartButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { onShootCta } = usePublicShootCta();

  return (
    <button
      type="button"
      onClick={onShootCta}
      className={className ?? DEFAULT_CLASS}
    >
      {children ?? GUEST_TRIAL_CTA_LABEL}
    </button>
  );
}
