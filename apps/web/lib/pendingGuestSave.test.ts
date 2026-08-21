/**
 * 비회원 결과 보관소. 여기서 조용히 틀리면 사용자는 "로그인하면 기록에 저장된다"는
 * 안내를 받고 로그인했는데 기록에 아무것도 없는 상태를 만난다.
 */
import {
  clearPendingGuestSave,
  getPendingGuestSave,
  PENDING_GUEST_SAVE_TTL_MS,
  setPendingGuestSave,
} from "@/lib/pendingGuestSave";

const NOW = 1_700_000_000_000;

const ENTRY = {
  sources: ["a", "b", "c", "d"],
  frameId: "classic-4" as const,
  remoteFrameId: null,
  outputFilter: "NONE" as const,
  displayName: "harucut_20260821_101500",
};

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe("pendingGuestSave", () => {
  it("보관했다가 그대로 돌려준다", () => {
    expect(setPendingGuestSave(ENTRY, NOW)).toBe(true);
    expect(getPendingGuestSave(NOW)).toMatchObject({
      ...ENTRY,
      savedAt: NOW,
    });
  });

  // 사파리 사생활 보호 모드 등은 setItem 이 조용히 아무것도 안 한다. 그때 true 를
  // 돌려주면 "로그인하면 저장된다"고 약속해 놓고 아무것도 안 남는다.
  it("쓰기가 실제로 남지 않으면 실패로 본다", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(setPendingGuestSave(ENTRY, NOW)).toBe(false);
  });

  it("기한이 지난 보관물은 없는 것으로 보고 지운다", () => {
    setPendingGuestSave(ENTRY, NOW);

    const justInside = NOW + PENDING_GUEST_SAVE_TTL_MS - 1;
    expect(getPendingGuestSave(justInside)).not.toBeNull();

    const expired = NOW + PENDING_GUEST_SAVE_TTL_MS + 1;
    expect(getPendingGuestSave(expired)).toBeNull();
    // 지웠으므로 시계를 되돌려도 살아나지 않는다.
    expect(getPendingGuestSave(NOW)).toBeNull();
  });

  // 레이아웃 카탈로그에 없는 프레임이면 합성 직전에 layout undefined 로 터진다.
  it("모르는 프레임이면 버린다", () => {
    setPendingGuestSave(
      { ...ENTRY, frameId: "not-a-frame" as never },
      NOW,
    );
    expect(getPendingGuestSave(NOW)).toBeNull();
  });

  it("원본이 4장이 아니면 버린다", () => {
    setPendingGuestSave({ ...ENTRY, sources: ["a", "b"] }, NOW);
    expect(getPendingGuestSave(NOW)).toBeNull();
  });

  it("보관하면 예전 v1 완성본 키도 같이 걷어낸다", () => {
    window.localStorage.setItem("harucut:pending-guest-save:v1", "old");
    setPendingGuestSave(ENTRY, NOW);
    expect(
      window.localStorage.getItem("harucut:pending-guest-save:v1"),
    ).toBeNull();

    clearPendingGuestSave();
    expect(getPendingGuestSave(NOW)).toBeNull();
  });
});
