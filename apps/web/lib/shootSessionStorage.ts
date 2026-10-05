import { isFrameId } from "@/constants/frames";
import { FOURCUT_FILTERS } from "@/lib/frameFilters";
import { blobToDataUrl } from "@/lib/canvas/loaders";
import { dataUrlToFile } from "@/lib/themeEditorDraft";
import { isFreshSavedAt } from "@/lib/pendingStorageTtl";
import { openBlobDatabase, runBlobTransaction } from "@/lib/idbBlobStore";
import type { ShootSessionState } from "@/lib/shootSessionStore";

export type ShootDraft = Pick<ShootSessionState,
  "frameId" | "remoteFrameId" | "source" | "shots" | "shotsFrameId" |
  "selectedIndexes" | "borderColor" | "outputFilter" | "composeIdempotency" | "eventName">;
export const SHOOT_DRAFT_TTL = 24 * 60 * 60 * 1000;
const STORE = "session";
const META = "meta";
const MAX_PHOTOS = 24;
const MAX_BYTES = 128 * 1024 * 1024;
type StoredDraft = Omit<ShootDraft, "shots"> & { shotKeys: string[]; savedAt: number };
// 문자열 자체는 Zustand 사진과 같은 참조. 변경되지 않은 컷은 다시 인코딩하거나 쓰지 않는다.
let savedShots = new Map<string, string>();

function encodeDraft(draft: ShootDraft, keys: string[], now: number): StoredDraft {
  const { shots, composeIdempotency, ...meta } = draft;
  let composition = null;
  if (composeIdempotency) {
    try {
      const input = JSON.parse(composeIdempotency.generationKey);
      const indexes = input.imageSources.map((src: string) => shots.indexOf(src));
      if (indexes.every((index: number) => index >= 0)) {
        composition = { ...composeIdempotency, generationKey: JSON.stringify({ ...input, imageSources: indexes }) };
      }
    } catch { /* 이전 입력이 현재 사진을 가리키지 않으면 복원할 멱등키도 없다. */ }
  }
  return { ...meta, composeIdempotency: composition, shotKeys: keys, savedAt: now };
}

function validMeta(value: unknown, now: number): value is StoredDraft {
  if (!value || typeof value !== "object") return false;
  const meta = value as StoredDraft;
  return isFreshSavedAt(meta.savedAt, now, SHOOT_DRAFT_TTL) &&
    (meta.frameId === null || isFrameId(meta.frameId)) &&
    (meta.shotsFrameId === null || isFrameId(meta.shotsFrameId)) &&
    (meta.remoteFrameId === null || (Number.isSafeInteger(meta.remoteFrameId) && meta.remoteFrameId > 0)) &&
    (meta.source === "camera" || meta.source === "upload") &&
    Array.isArray(meta.shotKeys) && meta.shotKeys.length <= MAX_PHOTOS &&
    meta.shotKeys.every((key) => typeof key === "string" && /^photo:[\w-]+$/.test(key)) &&
    Array.isArray(meta.selectedIndexes) && meta.selectedIndexes.length === 4 &&
    meta.selectedIndexes.every((index) => index === null || (Number.isInteger(index) && index >= 0 && index < meta.shotKeys.length)) &&
    typeof meta.borderColor === "string" && /^#?[a-f\d]{6}$/i.test(meta.borderColor) &&
    FOURCUT_FILTERS.some((filter) => filter.id === meta.outputFilter) &&
    (meta.eventName === null || (typeof meta.eventName === "string" && meta.eventName.length <= 200));
}

export async function readShootDraft(now = Date.now()): Promise<ShootDraft | null> {
  const db = await openBlobDatabase("harucut-shoot-session", STORE);
  if (!db) throw new Error("촬영 임시 보관소를 열 수 없어요.");
  try {
    const entries = await runBlobTransaction(db, STORE, "readonly", (store) => store.getAll());
    const meta = entries.find((entry) => entry && typeof entry === "object" && "shotKeys" in entry);
    if (!validMeta(meta, now)) {
      await runBlobTransaction(db, STORE, "readwrite", (store) => store.clear());
      savedShots.clear();
      return null;
    }
    const blobs: Blob[] = meta.shotKeys.map((key) => entries.find((entry) => entry?.key === key)?.blob);
    if (blobs.some((blob) => !(blob instanceof Blob) || !/^image\/(jpeg|png|webp)$/.test(blob.type)) ||
        blobs.reduce((sum, blob) => sum + blob.size, 0) > MAX_BYTES) {
      await runBlobTransaction(db, STORE, "readwrite", (store) => store.clear());
      savedShots.clear();
      return null;
    }
    const shots = await Promise.all(blobs.map(blobToDataUrl));
    savedShots = new Map(shots.map((shot, index) => [shot, meta.shotKeys[index]]));
    let composition = null;
    if (meta.composeIdempotency) {
      try {
        const c = meta.composeIdempotency;
        const input = JSON.parse(c.generationKey);
        if (typeof c.idempotencyKey === "string" && c.idempotencyKey.length <= 64 &&
            (c.frameContentKey === null || typeof c.frameContentKey === "string") &&
            Array.isArray(input.imageSources) && input.imageSources.length === 4 &&
            input.imageSources.every((i: number) => Number.isInteger(i) && i >= 0 && i < shots.length)) {
          composition = { ...c, generationKey: JSON.stringify({ ...input, imageSources: input.imageSources.map((i: number) => shots[i]) }) };
        }
      } catch { /* 오래되거나 깨진 합성 입력은 재사용하지 않는다. */ }
    }
    return {
      frameId: meta.frameId, remoteFrameId: meta.remoteFrameId, source: meta.source,
      shots, shotsFrameId: meta.shotsFrameId, selectedIndexes: meta.selectedIndexes,
      borderColor: meta.borderColor, outputFilter: meta.outputFilter,
      eventName: meta.eventName, composeIdempotency: composition,
    };
  } finally { db.close(); }
}

export async function writeShootDraft(draft: ShootDraft, now = Date.now()): Promise<void> {
  const nextShots = new Map<string, string>();
  const additions = new Map<string, Blob>();
  if (draft.shots.length > MAX_PHOTOS || draft.shots.reduce((sum, shot) => sum + shot.length, 0) > MAX_BYTES * 4 / 3) {
    throw new Error("사진이 너무 많아 임시 보관할 수 없어요.");
  }
  for (const shot of draft.shots) {
    const key = savedShots.get(shot) ?? nextShots.get(shot) ?? `photo:${crypto.randomUUID()}`;
    if (!savedShots.has(shot) && !nextShots.has(shot)) additions.set(key, dataUrlToFile(shot, "shot.jpg"));
    nextShots.set(shot, key);
  }
  const keys = draft.shots.map((shot) => nextShots.get(shot)!);
  const db = await openBlobDatabase("harucut-shoot-session", STORE);
  if (!db) throw new Error("촬영 임시 보관소를 열 수 없어요.");
  try {
    await runBlobTransaction(db, STORE, "readwrite", (store) => {
      // 컷 삭제·초기화 뒤에도 고아 사진이 디스크에 남지 않게 같은 트랜잭션에서 정리한다.
      const cursor = store.openKeyCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        if (cursor.result.key !== META && !keys.includes(String(cursor.result.key))) store.delete(cursor.result.key);
        cursor.result.continue();
      };
      for (const [shot, key] of nextShots) {
        const blob = additions.get(key);
        if (blob) store.put({ key, blob }, key);
        else {
          // 다른 탭이 보관물을 교체했어도 현재 탭의 사진을 누락하지 않는다.
          const existing = store.count(key);
          existing.onsuccess = () => {
            if (!existing.result) store.put({ key, blob: dataUrlToFile(shot, "shot.jpg") }, key);
          };
        }
      }
      return store.put(encodeDraft(draft, keys, now), META);
    });
    savedShots = nextShots;
  } finally { db.close(); }
}

export async function deleteShootDraft(): Promise<void> {
  const db = await openBlobDatabase("harucut-shoot-session", STORE);
  if (!db) throw new Error("촬영 임시 보관소를 열 수 없어요.");
  try {
    await runBlobTransaction(db, STORE, "readwrite", (store) => store.clear());
    savedShots.clear();
  } finally { db.close(); }
}
