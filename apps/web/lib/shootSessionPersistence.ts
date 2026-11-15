"use client";

import { create } from "zustand";
import { useShootSession, type ShootSessionState } from "@/lib/shootSessionStore";
import { readShootDraft, writeShootDraft, deleteShootDraft } from "@/lib/shootSessionStorage";
import { isGuestVisitor } from "@/lib/guestTrialStore";

export const useShootPersistence = create<{ ready: boolean; error: boolean }>(() => ({ ready: false, error: false }));
let initialization: Promise<void> | undefined;
let queue = Promise.resolve();
let revision = 0;
const FIELDS = ["frameId", "remoteFrameId", "source", "shots", "shotsFrameId", "selectedIndexes", "outputFilter", "photoName", "composeIdempotency", "completed"] as const;
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

/**
 * 자식 페이지의 세션 가드가 실행되기 전에 한 번 복원한다.
 *
 * 비회원이 찍던 사진은 이 기기에 남기지 않는다(2026-11-15 「비회원 촬영하던 사진 관리 안 해도 될 거 같아. 지워버려」).
 * 비회원의 사진은 이 탭의 메모리에만 있고, 새로고침하거나 다시 들어오면 새 촬영이다 — 그래서 /create 의
 * 「촬영하던 사진이 있어요」·「완성한 사진이 있어요」도 비회원에게는 없다. 예전에 남긴 것은 복원하지 않고 지운다.
 * 회원은 그대로 24시간 이어서 만든다. 비회원 결과를 로그인 뒤 기록으로 옮기는 보관은 따로다(lib/pendingGuestSave.ts).
 */
export function initializeShootSession(): Promise<void> {
  if (initialization) return initialization;
  const current = revision;
  initialization = (async () => {
    try {
      if (isGuestVisitor()) {
        // 지우지 못해도 알릴 일이 아니다 — 비회원에게는 「임시 보관하지 못했어요」가 맞는 말이 아니다.
        await deleteShootDraft().catch(() => undefined);
      } else if (clearedAt()) await deleteShootDraft();
      else {
        const draft = await readShootDraft();
        if (draft && current === revision) useShootSession.setState(draft);
      }
    } catch { useShootPersistence.setState({ error: true }); }
    useShootSession.subscribe((state, previous) => {
      if (isGuestVisitor()) return;
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
