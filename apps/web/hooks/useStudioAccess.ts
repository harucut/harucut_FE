"use client";

import { useEffect, useSyncExternalStore } from "react";
import { listMyEvents } from "@/lib/studio/accessApi";
import { listWorkspaces } from "@/lib/studio/studioApi";

/**
 * 이 계정이 행사 운영(Studio)을 쓰는가. 운영 공간(ORGANIZATION)이 있거나 맡은·초대받은 행사가 있으면 쓴다.
 *
 * 개인 사용자에게 「행사 운영」을 보이면 할 일 없는 빈 화면으로 보낸다. 그래서 입구는 이 값이 true 일 때만 그린다.
 * 화면마다 두 번씩 묻지 않게 탭 저장소에 둔다. 둘 다 실패하면 저장하지 않는다 — 다음 화면에서 다시 묻는다.
 */
const KEY = "harucut:studio-access";
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readCache(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function writeCache(value: "yes" | "no" | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, value);
  } catch {
    // 저장소를 못 쓰면 매번 묻는다. 입구가 늦게 나타날 뿐이다.
  }
  listeners.forEach((listener) => listener());
}

/** 공간을 만들었거나 초대를 받았다 — 다시 묻지 않고 입구를 연다. */
export function rememberStudioAccess() {
  writeCache("yes");
}

/** 로그아웃 — 다음 계정에 앞 계정의 입구가 남지 않게 한다. */
export function forgetStudioAccess() {
  writeCache(null);
}

async function fetchAccess() {
  const [workspaces, events] = await Promise.allSettled([listWorkspaces(), listMyEvents()]);
  const has =
    (workspaces.status === "fulfilled" && workspaces.value.some((w) => w.type === "ORGANIZATION")) ||
    (events.status === "fulfilled" && events.value.length > 0);
  if (has) {
    writeCache("yes");
    return;
  }
  // 없다는 답은 둘 다 성공했을 때만 믿는다. 하나가 일시 실패한 채 「없음」을 기억하면, 복구돼도 이 탭에서는 입구가 사라진 채 남는다.
  if (workspaces.status === "fulfilled" && events.status === "fulfilled") writeCache("no");
}

export function useStudioAccess(): boolean {
  const value = useSyncExternalStore(subscribe, () => readCache() === "yes", () => false);
  useEffect(() => {
    if (readCache() !== null || inflight) return;
    inflight = fetchAccess().finally(() => {
      inflight = null;
    });
  }, []);
  return value;
}
