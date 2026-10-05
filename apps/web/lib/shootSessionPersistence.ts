"use client";

import { create } from "zustand";
import { useShootSession, type ShootSessionState } from "@/lib/shootSessionStore";
import { readShootDraft, writeShootDraft, deleteShootDraft } from "@/lib/shootSessionStorage";

export const useShootPersistence = create<{ ready: boolean; error: boolean }>(() => ({ ready: false, error: false }));
let initialization: Promise<void> | undefined;
let queue = Promise.resolve();
let revision = 0;
const FIELDS = ["frameId", "remoteFrameId", "source", "shots", "shotsFrameId", "selectedIndexes", "borderColor", "outputFilter", "composeIdempotency", "eventName"] as const;
// 삭제 실패 후 저장소가 다시 열려도 로그아웃 전의 사진을 복원하지 않는다.
const CLEARED_KEY = "harucut:shoot-cleared-at";
function clearedAt() {
  try { return window.localStorage.getItem(CLEARED_KEY); } catch { return null; }
}
function enqueueSave(state: ShootSessionState) {
  const current = ++revision;
  queue = queue.then(async () => {
    if (current !== revision) return;
    try {
      await writeShootDraft(state);
      // clear가 쓰기 도중 들어오면 삭제 표식을 먼저 지우지 않는다.
      if (current === revision) {
        try { window.localStorage.removeItem(CLEARED_KEY); } catch { /* 비공개 모드 */ }
        useShootPersistence.setState({ error: false });
      }
    } catch { useShootPersistence.setState({ error: true }); }
  });
}

/** 자식 페이지의 세션 가드가 실행되기 전에 한 번 복원한다. */
export function initializeShootSession(): Promise<void> {
  if (initialization) return initialization;
  const current = revision;
  initialization = (async () => {
    try {
      if (clearedAt()) await deleteShootDraft();
      else {
        const draft = await readShootDraft();
        if (draft && current === revision) useShootSession.setState(draft);
      }
    } catch { useShootPersistence.setState({ error: true }); }
    useShootSession.subscribe((state, previous) => {
      if (FIELDS.some((field) => state[field] !== previous[field])) enqueueSave(state);
    });
    useShootPersistence.setState({ ready: true });
  })();
  return initialization;
}

export async function clearShootSession(): Promise<void> {
  revision += 1;
  try { window.localStorage.setItem(CLEARED_KEY, String(Date.now())); } catch { /* 저장소가 차단된 환경 */ }
  useShootSession.getState().reset();
  revision += 1; // reset에서 대기열에 들어간 빈 스냅샷도 취소한다.
  queue = queue.then(async () => {
    try { await deleteShootDraft(); }
    catch { useShootPersistence.setState({ error: true }); }
  });
  await queue;
}

export function flushShootSession() { return queue; }
