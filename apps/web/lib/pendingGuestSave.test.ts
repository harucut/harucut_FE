/**
 * 비회원 결과 보관소. 여기서 조용히 틀리면 사용자는 "로그인하면 기록에 저장된다"는
 * 안내를 받고 로그인했는데 기록에 아무것도 없는 상태를 만난다.
 */
import {
  clearPendingGuestSave,
  ensurePendingGuestSaveComposeKey,
  getPendingGuestSave,
  PENDING_GUEST_SAVE_TTL_MS,
  setPendingGuestSave,
} from "@/lib/pendingGuestSave";

const NOW = 1_700_000_000_000;

/** 보관 키. 저장된 모양을 직접 손볼 때만 쓴다. */
const STORAGE_KEY = "harucut:pending-guest-save:v2";

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

  /*
    비회원이 고른 배경색이 곧 저장본의 색이다. 인계에서 빠지면 로그인 후 서버 합성이
    색 없이 나가고, 서버는 프레임에 저장된 배경으로 그린다 — 방금 내려받아 본 그림과
    기록에 남는 그림의 배경색이 갈린다.
  */
  it("고른 배경색을 그대로 돌려준다", () => {
    setPendingGuestSave({ ...ENTRY, backgroundColor: "#ffffff" }, NOW);
    expect(getPendingGuestSave(NOW)?.backgroundColor).toBe("#ffffff");
  });

  // 색이 없던 시절의 보관물도 그대로 살린다. 필수 필드로 만들거나 키를 v3 로 올리면
  // 이미 보관된 인계물이 통째로 버려진다.
  it("색이 없는 옛 보관물은 색만 빠진 채 살린다", () => {
    setPendingGuestSave(ENTRY, NOW);
    const stored = getPendingGuestSave(NOW);
    expect(stored?.backgroundColor).toBeUndefined();
    expect(stored?.sources).toHaveLength(4);
  });

  // 형식이 어긋난 색을 그대로 실어 보내면 합성 요청이 400 으로 떨어져 보관물 전체를 잃는다.
  it("깨진 색은 없는 것으로 본다", () => {
    setPendingGuestSave({ ...ENTRY, backgroundColor: "red" }, NOW);
    expect(getPendingGuestSave(NOW)?.backgroundColor).toBeUndefined();
  });

  /*
    인계는 한 번에 끝나지 않을 수 있다. 서버 합성이 이미 성공했어도 폴링이 시간 초과되거나
    뒤따르는 조회가 실패하면 다시 해 볼 만한 실패로 보고 보관물을 남긴다. 그때 멱등키까지
    새로 만들면 재시도가 예전 작업을 재생하지 못하고 **같은 네컷을 기록에 한 벌 더** 만든다.
  */
  it("한 번 심은 멱등키는 보관물이 살아 있는 동안 그대로 쓴다", () => {
    setPendingGuestSave(ENTRY, NOW);

    const first = ensurePendingGuestSaveComposeKey(NOW);
    expect(typeof first).toBe("string");
    // 보관물에 남았으므로 새로고침 뒤(= 다시 읽어도) 같은 값이다.
    expect(getPendingGuestSave(NOW)?.composeIdempotencyKey).toBe(first);
    expect(ensurePendingGuestSaveComposeKey(NOW)).toBe(first);
  });

  it("키를 심어도 나머지 보관 내용은 그대로다", () => {
    setPendingGuestSave({ ...ENTRY, backgroundColor: "#ffffff" }, NOW);
    ensurePendingGuestSaveComposeKey(NOW);

    expect(getPendingGuestSave(NOW)).toMatchObject({
      ...ENTRY,
      backgroundColor: "#ffffff",
      savedAt: NOW,
    });
  });

  /*
    새로 찍은 네컷이 옛 키를 물려받으면 서버가 앞 작업을 재생해, 방금 찍은 사진 대신
    예전 그림이 기록에 남는다. 보관물을 통째로 갈아 끼우므로 키도 같이 사라져야 한다.
  */
  it("새로 보관하면 옛 멱등키를 물려받지 않는다", () => {
    setPendingGuestSave(ENTRY, NOW);
    const old = ensurePendingGuestSaveComposeKey(NOW);

    setPendingGuestSave({ ...ENTRY, sources: ["e", "f", "g", "h"] }, NOW);

    expect(getPendingGuestSave(NOW)?.composeIdempotencyKey).toBeUndefined();
    expect(ensurePendingGuestSaveComposeKey(NOW)).not.toBe(old);
  });

  it("보관물이 없으면 키를 만들지 않는다", () => {
    expect(ensurePendingGuestSaveComposeKey(NOW)).toBeNull();
  });

  // 길이 상한(64자)을 넘긴 값을 그대로 실어 보내면 합성 요청이 400 이다.
  it("깨진 멱등키는 없는 것으로 보고 새로 심는다", () => {
    setPendingGuestSave(ENTRY, NOW);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...stored, composeIdempotencyKey: "x".repeat(65) }),
    );

    expect(getPendingGuestSave(NOW)?.composeIdempotencyKey).toBeUndefined();

    const fresh = ensurePendingGuestSaveComposeKey(NOW) ?? "";
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.length).toBeLessThanOrEqual(64);
  });

  // 되쓰기가 막혀도 이번 시도는 키를 들고 간다. 못 남기는 것과 못 쓰는 것은 다르다.
  it("키를 못 남겨도 보관물은 지키고 키는 돌려준다", () => {
    setPendingGuestSave(ENTRY, NOW);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(typeof ensurePendingGuestSaveComposeKey(NOW)).toBe("string");

    jest.restoreAllMocks();
    // 원본 4장은 그대로 있다 — 키 한 줄 때문에 인계를 통째로 잃지 않는다.
    expect(getPendingGuestSave(NOW)?.sources).toHaveLength(4);
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
