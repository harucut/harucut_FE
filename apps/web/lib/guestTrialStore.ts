"use client";

import { create } from "zustand";
import {
  GUEST_ALLOWED_ITEMS,
  GUEST_MEMBER_ONLY_ITEMS,
  GUEST_TRIAL_NOTICE,
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
  | "start-guest-trial";

export type GuestNoticeAction = {
  id: GuestNoticeActionId;
  label: string;
  variant?: "primary" | "secondary";
  // 액션 기본 경로 대신 이동할 경로. 비회원 결과물 인계처럼
  // redirectTo 쿼리가 필요한 경우에 쓴다.
  href?: string;
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
  notice: GuestNoticeState | null;
  clearNotice: () => void;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  hydrateGuestMode: () => void;
  setNotice: (notice: GuestNoticeState) => void;
  showGuestRestrictedNotice: () => void;
  showGuestSavedNotice: (options?: { loginHref?: string }) => void;
  showGuestShareNotice: () => void;
  showGuestTrialNotice: () => void;
};

// 되는 것·안 되는 것의 목록은 @harucut/shared 에 한 벌만 둔다(앱도 같은 값을 읽는다).
// 여기서는 상황에 맞는 문장으로 감싸기만 한다.
const GUEST_ALLOWED_SCOPE = `체험 중에는 ${GUEST_ALLOWED_ITEMS}를 이용할 수 있어요.`;
const GUEST_MEMBER_ONLY_SCOPE = `${GUEST_MEMBER_ONLY_ITEMS}은 로그인 후에 이용할 수 있어요.`;

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
  notice: null,
  clearNotice: () => set({ notice: null }),
  enterGuestMode: () => {
    setGuestCookie(true);
    set({ accessMode: "guest", notice: null });
  },
  exitGuestMode: () => {
    setGuestCookie(false);
    set({ accessMode: "member", notice: null });
  },
  hydrateGuestMode: () =>
    set({
      accessMode: hasGuestCookie() ? "guest" : "member",
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
  // loginHref를 넘기면 "로그인하고 계속하기"가 그 경로로 이동한다.
  // 결과물을 미리 보관해 둔 뒤 로그인 후 자동 저장으로 이어 줄 때 쓴다.
  //
  // 보관에 실패했으면(용량 초과 등) loginHref 없이 부른다. 그때 같은 문구를 쓰면
  // "로그인하면 기록에 저장된다"고 약속해 놓고 정작 아무것도 남지 않는다 —
  // 사실대로 "이 기기에만 남았다"고 말한다.
  showGuestSavedNotice: (options) =>
    set({
      notice: {
        actions: [
          { id: "go-login", label: "로그인하고 계속하기", href: options?.loginHref },
          { id: "dismiss", label: "닫기", variant: "secondary" },
        ],
        eyebrow: "NEXT STEP",
        icon: "check",
        message: options?.loginHref
          ? "체험 결과 이미지를 기기에 저장했어요. 로그인하면 링크 공유와 기록 저장까지 바로 이어서 이용할 수 있어요."
          : "체험 결과 이미지를 기기에 저장했어요. 다만 이 결과를 기록으로 옮길 준비는 하지 못했어요 — 로그인 후에는 다시 찍어야 기록에 남길 수 있어요.",
        title: "체험 사진이 저장됐어요",
      },
    }),
  showGuestShareNotice: () =>
    set({
      notice: {
        actions: [
          { id: "go-login", label: "로그인하고 계속하기" },
          { id: "dismiss", label: "닫기", variant: "secondary" },
        ],
        eyebrow: "GUEST MODE",
        icon: "sparkles",
        message: `${GUEST_ALLOWED_SCOPE} ${GUEST_MEMBER_ONLY_SCOPE}`,
        title: "링크 공유는 로그인 후에 이용할 수 있어요",
      },
    }),
  showGuestTrialNotice: () =>
    set({
      notice: {
        actions: [
          // 누른 버튼과 확인 버튼이 같은 말을 한다. 예전에는 "가입 없이 찍어보기"를 눌렀는데
          // "무료로 체험 시작"이 떠서, 같은 행동을 두 이름으로 만났다.
          { id: "start-guest-trial", label: GUEST_TRIAL_NOTICE.confirmLabel },
          { id: "go-login", label: GUEST_TRIAL_NOTICE.loginLabel, variant: "secondary" },
        ],
        message: GUEST_TRIAL_NOTICE.message,
        title: GUEST_TRIAL_NOTICE.title,
      },
    }),
}));
