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
  showGuestSavedNotice: () => void;
  showGuestShareNotice: () => void;
  showGuestTrialNotice: () => void;
};

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

  document.cookie = enabled
    ? `${GUEST_TRIAL_COOKIE}=1; path=/; max-age=604800; SameSite=Lax`
    : `${GUEST_TRIAL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
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
        message:
          "비회원 체험에서는 서버와 통신하지 않고 프론트 자체만으로 촬영과 이미지 다운로드만 가능합니다. 링크 공유, 기록 저장, 업로드 시작, 프레임 꾸미기 같은 서버 연동 기능은 로그인 후에 사용할 수 있어요.",
        title: "지금은 촬영 체험만 가능해요",
      },
    }),
  showGuestSavedNotice: () =>
    set({
      notice: {
        actions: [
          { id: "go-login", label: "로그인하고 계속하기" },
          { id: "dismiss", label: "닫기", variant: "secondary" },
        ],
        eyebrow: "NEXT STEP",
        icon: "check",
        message:
          "체험 결과 이미지를 기기에 저장했어요. 로그인하면 기록 저장, 링크 공유, 업로드 시작 같은 서버 연동 기능까지 바로 이어서 사용할 수 있어요.",
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
        eyebrow: "DOWNLOAD ONLY",
        icon: "sparkles",
        message:
          "비회원 체험에서는 링크 공유를 지원하지 않아요. 서버를 통해 결과를 보관하고 링크로 공유하는 기능은 로그인 후에 사용할 수 있습니다.",
        title: "지금은 이미지 다운로드만 가능해요",
      },
    }),
  showGuestTrialNotice: () =>
    set({
      notice: {
        actions: [
          { id: "start-guest-trial", label: "촬영 체험 시작" },
          { id: "go-login", label: "로그인하기", variant: "secondary" },
        ],
        eyebrow: "TRY HARUCUT",
        icon: "camera",
        message:
          "비회원 체험에서는 서버와 통신하지 않고 프론트 자체만으로 촬영과 이미지 다운로드만 가능합니다. 링크 공유는 불가하고, 서버를 통해야 하는 기능은 로그인 후에 사용할 수 있어요.",
        title: "비회원 체험을 시작할까요?",
      },
    }),
}));
