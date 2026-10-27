import { storeConflictSource, storePlatformOf, subscriptionManageHint } from "@harucut/shared";
import { ApiRequestError } from "@/lib/clientApi";
import { buyPlusInApp, resetResumeForTest, restoreInApp, resumeUnfinishedPurchases } from "@/lib/storePurchase";

const mockPost = jest.fn();
const mockSub = jest.fn();
const bridge = {
  getNativeShell: jest.fn(),
  supportsStorePurchase: jest.fn(),
  nativeStorePurchase: jest.fn(),
  nativeStoreRestore: jest.fn(),
  nativeStoreFinish: jest.fn(),
};
jest.mock("@/lib/clientApi", () => ({
  ...jest.requireActual("@/lib/clientApi"),
  clientApi: { post: (...a: unknown[]) => mockPost(...a) },
}));
jest.mock("@/lib/userApi", () => ({ getMySubscription: () => mockSub() }));
const flags = { storeOpen: false };
jest.mock("@harucut/shared", () => {
  const actual = jest.requireActual("@harucut/shared");
  return {
    ...actual,
    get STORE_PURCHASES_ENABLED() {
      return flags.storeOpen;
    },
  };
});
jest.mock("@/lib/nativeBridge", () => ({
  getNativeShell: () => bridge.getNativeShell(),
  supportsStorePurchase: () => bridge.supportsStorePurchase(),
  nativeStorePurchase: (...a: unknown[]) => bridge.nativeStorePurchase(...a),
  nativeStoreRestore: (...a: unknown[]) => bridge.nativeStoreRestore(...a),
  nativeStoreFinish: (...a: unknown[]) => bridge.nativeStoreFinish(...a),
}));

const SUB = { planTier: "PLUS", status: "ACTIVE", source: "APP_STORE", storeAccountToken: "acct-1" };

beforeEach(() => {
  jest.clearAllMocks();
  bridge.getNativeShell.mockReturnValue({ version: 3, platform: "ios" });
  bridge.supportsStorePurchase.mockReturnValue(true);
  mockSub.mockResolvedValue({ planTier: "BASIC", status: "ACTIVE", storeAccountToken: "acct-1" });
  mockPost.mockResolvedValue({ data: { data: SUB } });
  bridge.nativeStoreFinish.mockResolvedValue(true);
  flags.storeOpen = false;
  resetResumeForTest();
});

describe("구독 출처 규칙", () => {
  it("출처마다 어디서 관리하는지 말하고, 모르는 값은 말하지 않는다", () => {
    expect(subscriptionManageHint("APP_STORE")).toContain("iPhone 설정");
    expect(subscriptionManageHint("PLAY_STORE")).toContain("Play 스토어");
    expect(subscriptionManageHint(undefined)).toBeNull();
    expect(storePlatformOf("android")).toBe("PLAY_STORE");
    expect(storeConflictSource({ data: { data: { source: "WEB" } } })).toBe("WEB");
    expect(storeConflictSource({ data: { data: { source: "EVIL" } } })).toBeNull();
  });
});

/*
  앱 구독 구매(P4-B). 서버가 받아들인 뒤에만 거래를 마친다 — 먼저 마치면 제출이 실패한 구매를 스토어가 다시 보내지 않아 잃는다.
*/
describe("앱에서 플러스 구독", () => {
  it("계정 토큰을 실어 사고, 서버 제출이 성공하면 거래를 마친다", async () => {
    bridge.nativeStorePurchase.mockResolvedValue({ ok: true, value: { productId: "harucut.plus.monthly", proof: "jws-1" } });
    const result = await buyPlusInApp();

    expect(bridge.nativeStorePurchase).toHaveBeenCalledWith("harucut.plus.monthly", "acct-1");
    expect(mockPost).toHaveBeenCalledWith("/api/client/subscriptions/store-purchases", {
      platform: "APP_STORE",
      productId: "harucut.plus.monthly",
      proof: "jws-1",
    });
    expect(bridge.nativeStoreFinish).toHaveBeenCalledWith(["jws-1"]);
    expect(result).toEqual({ kind: "done", subscription: SUB, finishPending: false });
  });

  // 서버엔 반영됐지만 스토어 거래를 못 마쳤으면 그렇다고 알린다 — 안드로이드는 3일 안에 마치지 않으면 환불된다(Codex #566).
  it("거래 마무리가 실패하면 완료 결과에 미완료를 싣는다", async () => {
    bridge.nativeStorePurchase.mockResolvedValue({ ok: true, value: { productId: "harucut.plus.monthly", proof: "jws-1" } });
    bridge.nativeStoreFinish.mockResolvedValue(false);
    expect(await buyPlusInApp()).toEqual({ kind: "done", subscription: SUB, finishPending: true });
  });

  it("서버가 거절하면 거래를 마치지 않고, 다른 곳에서 구독 중이면(SUBS-009) 관리할 곳을 붙인다", async () => {
    bridge.nativeStorePurchase.mockResolvedValue({ ok: true, value: { productId: "harucut.plus.monthly", proof: "jws-1" } });
    mockPost.mockRejectedValue(
      new ApiRequestError({ status: 409, code: "SUBS-009", apiMessage: "x", data: { code: "SUBS-009", data: { source: "WEB" } } }),
    );
    const result = await buyPlusInApp();

    expect(bridge.nativeStoreFinish).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "error",
      message: "이미 다른 곳에서 구독 중이에요. 그곳에서 관리해 주세요. 하루컷 웹에서 결제한 구독이에요.",
    });
  });

  it("결제 창을 닫으면 아무 안내도 없고, 구버전 셸이면 업데이트를 안내한다(웹 결제로 우회하지 않는다)", async () => {
    bridge.nativeStorePurchase.mockResolvedValue({ ok: false, message: null });
    expect(await buyPlusInApp()).toEqual({ kind: "cancelled" });
    expect(mockPost).not.toHaveBeenCalled();

    bridge.supportsStorePurchase.mockReturnValue(false);
    expect(await buyPlusInApp()).toEqual({ kind: "unsupported" });
  });
});

describe("구매 복원", () => {
  it("우리 상품만 보내고, 서버가 받아들이면 모두 마친다", async () => {
    bridge.getNativeShell.mockReturnValue({ version: 3, platform: "android" });
    bridge.nativeStoreRestore.mockResolvedValue({
      ok: true,
      value: [
        { productId: "harucut.plus.monthly", proof: "t1" },
        { productId: "other.app.product", proof: "t2" },
      ],
    });
    const result = await restoreInApp();

    expect(mockPost).toHaveBeenCalledWith("/api/client/subscriptions/store-purchases/restore", {
      platform: "PLAY_STORE",
      items: [{ productId: "harucut.plus.monthly", proof: "t1" }],
    });
    expect(bridge.nativeStoreFinish).toHaveBeenCalledWith(["t1"]);
    expect(result.kind).toBe("done");
  });

  it("복원할 것이 없으면 서버에 보내지 않는다", async () => {
    bridge.nativeStoreRestore.mockResolvedValue({ ok: true, value: [] });
    expect(await restoreInApp()).toEqual({ kind: "error", message: "이 스토어 계정에 복원할 구독이 없어요." });
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// 마치지 못한 거래는 앱이 열릴 때 조용히 이어서 마친다(Codex #566). 앱 결제를 열지 않았으면 아무것도 하지 않는다.
describe("미완료 거래 이어서 마치기", () => {
  it("앱 결제가 꺼져 있으면 스토어를 부르지 않는다", async () => {
    await resumeUnfinishedPurchases();
    expect(bridge.nativeStoreRestore).not.toHaveBeenCalled();
  });

  it("켜져 있으면 한 번만 복원 길로 제출하고 마친다", async () => {
    flags.storeOpen = true;
    bridge.nativeStoreRestore.mockResolvedValue({ ok: true, value: [{ productId: "harucut.plus.monthly", proof: "t9" }] });
    await resumeUnfinishedPurchases();
    await resumeUnfinishedPurchases();
    expect(bridge.nativeStoreRestore).toHaveBeenCalledTimes(1);
    // 자동 재시도는 스토어 동기화를 하지 않는다 — 인증 창이 뜰 수 있다(Codex #566).
    expect(bridge.nativeStoreRestore).toHaveBeenCalledWith({ sync: false });
    expect(bridge.nativeStoreFinish).toHaveBeenCalledWith(["t9"]);
  });
});
