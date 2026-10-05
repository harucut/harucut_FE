"use client";

import { create } from "zustand";
import {
  GUEST_ALLOWED_ITEMS,
  GUEST_MEMBER_ONLY_ITEMS,
  withJosa,
} from "@harucut/shared";
import {
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
} from "@/lib/guestTrialShared";

export type GuestAccessMode = "guest" | "member";

export type GuestNoticeActionId =
  | "dismiss"
  | "go-login"
  | "go-shoot"
  | "save-guest-handoff"
  | "discard-guest-handoff";

export type GuestNoticeAction = {
  id: GuestNoticeActionId;
  label: string;
  variant?: "primary" | "secondary";
  // 액션 기본 경로 대신 이동할 경로. 비회원 결과물 인계처럼
  // redirectTo 쿼리가 필요한 경우에 쓴다.
  href?: string;
  /*
    누르면 실행할 동작.

    비회원 보관물을 계정에 저장할지 묻는 확인처럼, 실제 일(서버 합성·보관물 폐기)을
    쥐고 있는 쪽은 스토어가 아니라 그것을 띄운 컴포넌트다. 액션 이름마다 스토어에
    분기를 늘리는 대신 콜백을 받는다.
  */
  onSelect?: () => void;
};

export type GuestNoticeState = {
  actions: GuestNoticeAction[];
  eyebrow?: string;
  icon?: "camera" | "check" | "lock" | "sparkles";
  message: string;
  title: string;
};

type GuestTrialStore = {
  accessMode: GuestAccessMode;
  /**
   * 쿠키를 읽어 accessMode 를 정했는가.
   *
   * 초깃값이 "member" 라, 이 값을 보지 않으면 **진짜 비회원도 첫 렌더에서는 회원으로 읽힌다.**
   * 회원일 때만 하는 일(보관해 둔 네컷의 서버 합성)을 그 순간에 시작하면 401 이 난다.
   */
  hydrated: boolean;
  notice: GuestNoticeState | null;
  clearNotice: () => void;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  hydrateGuestMode: () => void;
  setNotice: (notice: GuestNoticeState) => void;
  showGuestRestrictedNotice: () => void;
};

// 되는 것·안 되는 것의 목록은 @harucut/shared 에 한 벌만 둔다(앱도 같은 값을 읽는다).
// 여기서는 상황에 맞는 문장으로 감싸기만 한다.
// 조사는 withJosa 로 고른다. 손으로 붙여 두면 목록 끝 항목이 바뀔 때마다 어긋난다 —
// 실제로 "이미지 저장를", "프레임 만들기은" 이 나가고 있었다.
const GUEST_ALLOWED_SCOPE = `체험 중에는 ${withJosa(GUEST_ALLOWED_ITEMS, "을/를")} 이용할 수 있어요.`;
const GUEST_MEMBER_ONLY_SCOPE = `${withJosa(GUEST_MEMBER_ONLY_ITEMS, "은/는")} 로그인 후에 이용할 수 있어요.`;

function hasGuestCookie() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .some((chunk) => chunk === `${GUEST_TRIAL_COOKIE}=1`);
}

function setGuestCookie(enabled: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  // 운영(HTTPS)에서는 Secure를 붙여 평문(HTTP) 구간 전송을 막는다.
  // 로컬 개발(http://localhost)에서 Secure를 붙이면 쿠키가 저장되지 않으므로 제외한다.
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";

  document.cookie = enabled
    ? `${GUEST_TRIAL_COOKIE}=1; path=/; max-age=${GUEST_TRIAL_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
    : `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`;
}

export const useGuestTrialStore = create<GuestTrialStore>((set) => ({
  accessMode: "member",
  hydrated: false,
  notice: null,
  clearNotice: () => set({ notice: null }),
  enterGuestMode: () => {
    setGuestCookie(true);
    // 사용자가 직접 고른 것이라 쿠키를 다시 읽을 필요가 없다 — 이 시점부터 값은 확정이다.
    set({ accessMode: "guest", hydrated: true, notice: null });
  },
  exitGuestMode: () => {
    setGuestCookie(false);
    set({ accessMode: "member", hydrated: true, notice: null });
  },
  hydrateGuestMode: () =>
    set({
      accessMode: hasGuestCookie() ? "guest" : "member",
      hydrated: true,
    }),
  setNotice: (notice) => set({ notice }),
  showGuestRestrictedNotice: () =>
    set({
      notice: {
        actions: [
          { id: "go-login", label: "로그인하기" },
          { id: "go-shoot", label: "촬영 계속하기", variant: "secondary" },
        ],
        eyebrow: "GUEST MODE",
        icon: "lock",
        message: `${GUEST_ALLOWED_SCOPE} ${GUEST_MEMBER_ONLY_SCOPE}`,
        title: "지금은 체험 기능만 이용할 수 있어요",
      },
    }),
}));
