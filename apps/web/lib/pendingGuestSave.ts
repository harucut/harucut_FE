"use client";

import type { FrameId } from "@/constants/frames";
import type { FourcutFilterId } from "@/lib/frameFilters";

/**
 * 비회원이 만든 네컷을 로그인 뒤 기록으로 옮기기 위한 보관소.
 *
 * 예전에는 **완성된 PNG 한 장**을 담았다. 지금은 **원본 4장과 만드는 방법**을 담는다.
 *
 * 이유는 둘이다.
 *  1. 완성본을 서버에 등록하는 API 가 없어졌다(405). 지금 결과물을 남기는 유일한 길은
 *     원본 4장을 올려 서버가 그리게 하는 것이라, 보관해야 할 것도 그 재료다.
 *  2. 더 작다. 완성본은 2000×6000 PNG 라 base64 로 담으면 localStorage 한도(대개 5MB)에
 *     자주 걸렸다. 원본 4장은 촬영 해상도 JPEG 이라 합쳐도 그보다 작다.
 *
 * 덤으로 결과가 좋아진다 — 로그인 후 서버가 전체 해상도로 다시 그리므로,
 * 비회원 때 브라우저가 iOS 캔버스 상한에 맞춰 줄여 그린 그림보다 크다.
 *
 * OAuth 는 전체 페이지 리다이렉트라 메모리로는 유실된다. 그래서 localStorage 다.
 */
const KEY = "harucut:pending-guest-save:v2";

export type PendingGuestSave = {
  /** 고른 순서 그대로의 원본 4장(data URL). 이 순서가 곧 슬롯 순서다. */
  sources: string[];
  frameId: FrameId;
  remoteFrameId: number | null;
  outputFilter: FourcutFilterId;
  displayName: string;
  savedAt: number;
};

/**
 * 보관한다. 용량 초과 등으로 실패하면 false — 호출부가 "먼저 내려받으라"고 안내한다.
 * 예전 v1 키(완성본 PNG)가 남아 있으면 같이 걷어낸다.
 */
export function setPendingGuestSave(
  entry: Omit<PendingGuestSave, "savedAt">,
  now: number,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem("harucut:pending-guest-save:v1");
    window.localStorage.setItem(KEY, JSON.stringify({ ...entry, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function getPendingGuestSave(): PendingGuestSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingGuestSave;
    // 원본 4장이 온전할 때만 쓸모가 있다.
    if (!Array.isArray(parsed?.sources) || parsed.sources.length !== 4) return null;
    if (parsed.sources.some((src) => typeof src !== "string" || !src)) return null;
    if (!parsed.frameId) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingGuestSave(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("harucut:pending-guest-save:v1");
  } catch {}
}
