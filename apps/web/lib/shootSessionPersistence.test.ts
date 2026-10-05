const mockRead = jest.fn();
const mockWrite = jest.fn();
const mockDelete = jest.fn();
jest.mock("./shootSessionStorage", () => ({
  readShootDraft: (...args: unknown[]) => mockRead(...args),
  writeShootDraft: (...args: unknown[]) => mockWrite(...args),
  deleteShootDraft: (...args: unknown[]) => mockDelete(...args),
}));
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  localStorage.clear();
  mockRead.mockResolvedValue(null);
  mockWrite.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
});
async function modules() {
  const persistence = await import("./shootSessionPersistence");
  const { useShootSession } = await import("./shootSessionStore");
  return { ...persistence, useShootSession };
}

test("복원이 끝나기 전에는 준비 상태가 아니며 한 번만 읽는다", async () => {
  let restore!: (value: unknown) => void;
  mockRead.mockImplementation(() => new Promise((resolve) => { restore = resolve; }));
  const m = await modules();
  const first = m.initializeShootSession();
  expect(m.initializeShootSession()).toBe(first);
  expect(m.useShootPersistence.getState().ready).toBe(false);
  restore({ shots: ["data:image/jpeg;base64,cGhvdG8="], frameId: "classic-4" });
  await first;
  expect(m.useShootPersistence.getState().ready).toBe(true);
  expect(m.useShootSession.getState().shots).toHaveLength(1);
  expect(mockRead).toHaveBeenCalledTimes(1);
});

test("로그아웃 전에 시작된 복원이 뒤늦게 끝나도 사진을 되살리지 않는다", async () => {
  let restore!: (value: unknown) => void;
  mockRead.mockImplementation(() => new Promise((resolve) => { restore = resolve; }));
  const m = await modules();
  const initializing = m.initializeShootSession();
  await m.clearShootSession();
  restore({ shots: ["private photo"] });
  await initializing;
  expect(m.useShootSession.getState().shots).toEqual([]);
  expect(mockDelete).toHaveBeenCalled();
});

test("연속 선택은 최신 상태를 쓰며 로그아웃이 대기 중 쓰기를 취소한다", async () => {
  const m = await modules();
  await m.initializeShootSession();
  m.useShootSession.getState().setFrameId("classic-4");
  m.useShootSession.getState().setFrameId("wide-4");
  await m.flushShootSession();
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockWrite.mock.calls[0][0].frameId).toBe("wide-4");
  mockWrite.mockClear();
  m.useShootSession.getState().addShotPhoto("data:image/jpeg;base64,cA==");
  await m.clearShootSession();
  expect(mockWrite).not.toHaveBeenCalled();
  expect(m.useShootSession.getState().shots).toEqual([]);
});

test("지우기 실패 기록이 있으면 다음 시작에서 옛 사진을 읽지 않는다", async () => {
  localStorage.setItem("harucut:shoot-cleared-at", "1");
  const m = await modules();
  await m.initializeShootSession();
  expect(mockRead).not.toHaveBeenCalled();
  expect(mockDelete).toHaveBeenCalled();
});

test("보관 실패를 표시하고 후속 쓰기 성공 시 해제한다", async () => {
  const m = await modules();
  await m.initializeShootSession();
  mockWrite.mockRejectedValueOnce(new Error("QuotaExceededError"));
  m.useShootSession.getState().setFrameId("classic-4");
  await m.flushShootSession();
  expect(m.useShootPersistence.getState().error).toBe(true);
  m.useShootSession.getState().setFrameId("wide-4");
  await m.flushShootSession();
  expect(m.useShootPersistence.getState().error).toBe(false);
});
