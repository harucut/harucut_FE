import { readShootDraft, writeShootDraft, deleteShootDraft, SHOOT_DRAFT_TTL, type ShootDraft } from "./shootSessionStorage";
import { useShootSession } from "./shootSessionStore";

const mockData = new Map<string, unknown>();
const mockPut = jest.fn((value: unknown, key: string) => { mockData.set(key, value); return { result: key }; });
let mockFail = false;
// 브라우저 저장 엔진은 기존 pendingGuestSave 테스트가 검사한다. 여기서는 사진·메타의
// 왕복, 만료, 중복 쓰기 방지와 손상된 저장물 처리를 검증한다.
jest.mock("./idbBlobStore", () => ({
  openBlobDatabase: async () => ({ close: jest.fn() }),
  runBlobTransaction: async (_db: unknown, _name: string, _mode: string, run: (store: unknown) => { result: unknown }) => {
    if (mockFail) throw new Error("QuotaExceededError");
    const store = {
      getAll: () => ({ result: [...mockData.values()] }),
      put: mockPut,
      delete: (key: string) => { mockData.delete(key); return { result: undefined }; },
      clear: () => { mockData.clear(); return { result: undefined }; },
      count: (key: string) => {
        const request = { result: mockData.has(key) ? 1 : 0, onsuccess: () => {} };
        queueMicrotask(() => request.onsuccess());
        return request;
      },
      openKeyCursor: () => {
        const keys = [...mockData.keys()];
        let index = 0;
        const request: { result: null | { key: string; continue: () => void }; onsuccess: () => void } = { result: null, onsuccess: () => {} };
        const next = () => {
          request.result = index < keys.length ? { key: keys[index++], continue: () => queueMicrotask(next) } : null;
          request.onsuccess();
        };
        queueMicrotask(next);
        return request;
      },
    };
    const result = run(store);
    // cursor와 count 요청이 끝나는 것을 흉내 낸다.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    return result.result;
  },
}));

const now = 1_800_000_000_000;
const shots = [1, 2, 3, 4].map((n) => `data:image/jpeg;base64,${btoa(`photo${n}`)}`);
function draft(): ShootDraft {
  return { ...useShootSession.getState(), frameId: "classic-4", shotsFrameId: "classic-4", shots, selectedIndexes: [0, 1, 2, 3], composeIdempotency: null };
}
beforeEach(async () => {
  mockFail = false;
  await deleteShootDraft();
  mockPut.mockClear();
});

test("사진은 Blob으로 한 번만 쓰고 선택·필터·멱등키는 새로고침 뒤 그대로 복원한다", async () => {
  const initial = draft();
  const generationKey = JSON.stringify({ frameId: initial.frameId, remoteFrameId: null, borderColor: initial.borderColor, outputFilter: "NONE", imageSources: shots });
  initial.composeIdempotency = { generationKey, idempotencyKey: "one-job", frameContentKey: null };
  await writeShootDraft(initial, now);
  expect(mockPut.mock.calls.filter(([value]) => (value as { blob?: Blob }).blob instanceof Blob)).toHaveLength(4);
  expect(JSON.stringify(mockData.get("meta"))).not.toContain("data:image");
  mockPut.mockClear();
  await writeShootDraft({ ...initial, selectedIndexes: [3, 2, 1, 0] }, now);
  expect(mockPut).toHaveBeenCalledTimes(1);
  const restored = await readShootDraft(now);
  expect(restored?.shots).toEqual(shots);
  expect(restored?.selectedIndexes).toEqual([3, 2, 1, 0]);
  expect(restored?.composeIdempotency).toEqual(initial.composeIdempotency);
});

test("삭제한 컷의 Blob도 지우고 빈 세션으로 다시 읽을 수 있다", async () => {
  await writeShootDraft(draft(), now);
  await writeShootDraft({ ...draft(), shots: [], selectedIndexes: [null, null, null, null] }, now);
  expect(mockData.size).toBe(1);
  expect((await readShootDraft(now))?.shots).toEqual([]);
});

test("24시간 경과, 미래 시각, 손상된 사진은 보관소에서 제거한다", async () => {
  for (const readAt of [now + SHOOT_DRAFT_TTL + 1, now - 600_000]) {
    await writeShootDraft(draft(), now);
    expect(await readShootDraft(readAt)).toBeNull();
    expect(mockData.size).toBe(0);
  }
  await writeShootDraft(draft(), now);
  const photoKey = [...mockData.keys()].find((key) => key.startsWith("photo:"))!;
  mockData.delete(photoKey);
  expect(await readShootDraft(now)).toBeNull();
  expect(mockData.size).toBe(0);
});

test("쓰기 실패를 성공으로 삼지 않고 다음 시도에서 사진을 다시 쓴다", async () => {
  mockFail = true;
  await expect(writeShootDraft(draft(), now)).rejects.toThrow("QuotaExceededError");
  mockFail = false;
  await writeShootDraft(draft(), now);
  expect((await readShootDraft(now))?.shots).toEqual(shots);
});

test("다른 탭이 사진을 삭제해도 현재 사진을 빠짐없이 다시 보관한다", async () => {
  await writeShootDraft(draft(), now);
  mockData.clear();
  await writeShootDraft(draft(), now);
  expect((await readShootDraft(now))?.shots).toEqual(shots);
});
