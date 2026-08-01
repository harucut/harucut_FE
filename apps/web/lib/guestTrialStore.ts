"use client";

import { create } from "zustand";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";

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

// 비회원 체험에서 열려 있는 범위. 안내 문구를 한 곳에서 관리해 화면마다 어긋나지 않게 한다.
const GUEST_ALLOWED_SCOPE =
  "비회원 체험에서는 촬영, 이미지 저장, 네컷 꾸미기를 이용할 수 있어요.";
const GUEST_MEMBER_ONLY_SCOPE =
  "링크 공유, 기록 저장, 업로드 제작은 로그인 후에 이용할 수 있어요.";

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
    ? `${GUEST_TRIAL_COOKIE}=1; path=/; max-age=604800; SameSite=Lax${secure}`
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
  showGuestSavedNotice: (options) =>
    set({
      notice: {
        actions: [
          { id: "go-login", label: "로그인하고 계속하기", href: options?.loginHref },
          { id: "dismiss", label: "닫기", variant: "secondary" },
        ],
        eyebrow: "NEXT STEP",
        icon: "check",
        message:
          "체험 결과 이미지를 기기에 저장했어요. 로그인하면 링크 공유, 기록 저장, 업로드 제작까지 바로 이어서 이용할 수 있어요.",
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
          { id: "start-guest-trial", label: "무료로 체험 시작" },
          { id: "go-login", label: "로그인하기", variant: "secondary" },
        ],
        message:
          "가입 없이 촬영·이미지 저장·꾸미기를 바로 체험할 수 있어요. 링크 공유와 기록 보관은 무료 가입 후 이용할 수 있어요.",
        title: "무료로 체험해볼까요?",
      },
    }),
}));
