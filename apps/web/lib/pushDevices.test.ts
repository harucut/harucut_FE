import {
  PUSH_UNREGISTER_DEADLINE_MS,
  hasServerPush,
  registerPushDevice,
  resetPushSyncForTest,
  syncPushDevice,
  unregisterPushDevice,
} from "@/lib/pushDevices";

const mockPost = jest.fn();
const shell = { info: null as null | { version: number; platform: "ios" | "android" }, token: null as string | null };
jest.mock("@/lib/clientApi", () => ({ clientApi: { post: (...a: unknown[]) => mockPost(...a) } }));
jest.mock("@/lib/nativeBridge", () => ({
  getNativeShell: () => shell.info,
  nativePushToken: async () => shell.token,
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  shell.info = { version: 4, platform: "ios" };
  shell.token = "ExponentPushToken[abc]";
  mockPost.mockResolvedValue({ data: {} });
  resetPushSyncForTest();
});

/*
  서버 푸시 기기 등록. 권한이 있을 때만 토큰이 오고, 등록한 기기는 로컬 「합성 완료」 알림을 끈다(두 번 알리지 않게).
  해제는 로그아웃 전에 본문으로 토큰을 보낸다(경로·쿼리에 싣지 않는다 — 로그에 남지 않게).
*/
describe("서버 푸시 기기", () => {
  it("토큰을 플랫폼과 함께 등록하고, 등록한 기기는 서버 푸시를 받는다고 기억한다", async () => {
    expect(await registerPushDevice()).toBe(true);
    expect(mockPost).toHaveBeenCalledWith("/api/client/devices", { token: "ExponentPushToken[abc]", platform: "ios" });
    expect(hasServerPush()).toBe(true);
  });

  it("셸 밖이거나 권한이 없어 토큰이 없으면 등록하지 않는다", async () => {
    shell.token = null;
    expect(await registerPushDevice()).toBe(false);
    shell.info = null;
    expect(await registerPushDevice()).toBe(false);
    expect(mockPost).not.toHaveBeenCalled();
    expect(hasServerPush()).toBe(false);
  });

  it("해제는 본문으로 토큰을 보내고, 실패해도 이 기기 기록은 지운다", async () => {
    await registerPushDevice();
    mockPost.mockRejectedValueOnce(new Error("offline"));
    await unregisterPushDevice();
    expect(mockPost).toHaveBeenLastCalledWith(
      "/api/client/devices/unregister",
      { token: "ExponentPushToken[abc]" },
      { signal: expect.any(AbortSignal) },
    );
    expect(hasServerPush()).toBe(false);
  });

  // Codex #567: 해제가 응답 없이 걸리면 로그아웃이 끝나지 않았다. 상한이 지나면 요청을 끊고 넘어간다.
  it("해제가 응답이 없으면 상한에서 요청을 끊고 끝난다", async () => {
    await registerPushDevice();
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockPost.mockImplementationOnce((_url: string, _body: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {}); // 신호를 따르지 않는 최악의 경우
    });
    let done = false;
    void unregisterPushDevice().then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(PUSH_UNREGISTER_DEADLINE_MS - 1);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(hasServerPush()).toBe(false);
    jest.useRealTimers();
  });

  it("화면이 열릴 때 맞추기는 성공하면 한 번만, 동시에 불러도 한 번만 한다", async () => {
    await Promise.all([syncPushDevice(), syncPushDevice()]);
    await syncPushDevice();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  // Codex #567: 첫 등록이 실패하면 문서를 새로 열기 전까지 다시 시도하지 않았다.
  it("등록이 실패하면 다음 맞추기에서 다시 시도한다", async () => {
    mockPost.mockRejectedValueOnce(new Error("offline"));
    await syncPushDevice();
    expect(hasServerPush()).toBe(false);
    await syncPushDevice();
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(hasServerPush()).toBe(true);
    await syncPushDevice();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
