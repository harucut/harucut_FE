/**
 * 저장한 프레임을 찍기 전에 확인한다(2026-11-15 「프레임에 문제가 있던 거면 촬영 전에부터 말해주는 게 맞지 않을까?」).
 * 예전에는 다 찍고 고른 뒤 합성에서야 알았다.
 */
import { SAVED_FRAME_CHECK_TIMEOUT_MS, checkSavedFrame } from "@/lib/savedFrameCheck";
import type { RemoteFrame } from "@/lib/api-types";

const mockGetFrame = jest.fn();
jest.mock("@/lib/remoteFrameApi", () => ({ getFrame: (...args: unknown[]) => mockGetFrame(...args) }));
jest.mock("@/lib/presignedUploadApi", () => ({
  getImageUrlByKey: async (key: string) => `https://s3.example.com/${key}`,
}));
let mockFreeCells = false;
jest.mock("@/lib/frameCells", () => ({
  ...jest.requireActual("@/lib/frameCells"),
  freeCellsEnabled: () => mockFreeCells,
}));

/** 그림 주소에 broken 이 들어 있으면 못 연다. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  referrerPolicy = "";
  set src(url: string) {
    queueMicrotask(() => (url.includes("broken") ? this.onerror?.() : this.onload?.()));
  }
}

const sticker = (key: string) => ({
  id: 1, type: "STICKER" as const, source: `https://s3.example.com/${key}?sig=1`, key, x: 0, y: 0, width: 100, height: 100,
});
const frame = (overrides: Partial<RemoteFrame> = {}): RemoteFrame => ({
  frameId: 7, title: "크리스마스 4컷", frameType: "CLASSIC", background: { type: "COLOR", value: "ffffff" },
  components: [sticker("uploads/users/1/heart.png")], ...overrides,
});

beforeEach(() => {
  mockGetFrame.mockReset();
  mockFreeCells = false;
  (global as unknown as { Image: unknown }).Image = FakeImage;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("프레임과 그림이 다 열리면 문제가 없다", async () => {
  mockGetFrame.mockResolvedValue(frame());
  await expect(checkSavedFrame(7)).resolves.toBeNull();
});

it("지워진 프레임이면 다른 프레임을 고르게 한다", async () => {
  mockGetFrame.mockRejectedValue(Object.assign(new Error("x"), { status: 404 }));
  await expect(checkSavedFrame(7)).resolves.toBe("고른 프레임을 찾을 수 없어요. 다른 프레임을 골라 주세요.");
});

it("자유 사진 칸 프레임은 합성이 열리기 전까지 촬영에 못 쓴다", async () => {
  const cell = { x: 0, y: 0, width: 400, height: 300, rotation: 0, shape: { type: "ELLIPSE" as const }, shotIndex: 0 };
  mockGetFrame.mockResolvedValue(frame({ cells: [cell, { ...cell, shotIndex: 1 }, { ...cell, shotIndex: 2 }, { ...cell, shotIndex: 3 }] }));
  await expect(checkSavedFrame(7)).resolves.toBe("이 프레임은 아직 촬영에 쓸 수 없어요. 곧 열릴 예정이에요.");
});

it("스티커가 저장소 key 가 아니면 서버가 못 읽는다 — 다시 저장하게 한다", async () => {
  mockGetFrame.mockResolvedValue(frame({ components: [{ ...sticker("x"), source: "/stickers/heart.png", key: "/stickers/heart.png" }] }));
  await expect(checkSavedFrame(7)).resolves.toBe(
    "프레임에 넣은 스티커나 글자를 쓸 수 없어요. 프레임 꾸미기에서 다시 저장한 뒤 골라 주세요.",
  );
});

it("배경이나 스티커 파일이 열리지 않으면 찍기 전에 말한다", async () => {
  mockGetFrame.mockResolvedValue(frame({ components: [sticker("uploads/users/1/broken.png")] }));
  await expect(checkSavedFrame(7)).resolves.toBe("프레임 그림을 불러오지 못했어요. 다시 누르거나 다른 프레임을 골라 주세요.");
});

// Codex 리뷰 #604 — 프레임 조회가 응답 없이 멈추면 그림 상한까지 가지도 못해 찍기 단추가 영영 잠겼다.
it("응답이 멈추면 상한 뒤 다시 누르게 한다 — 찍기 단추가 영영 잠기지 않는다", async () => {
  jest.useFakeTimers();
  try {
    mockGetFrame.mockReturnValue(new Promise(() => {}));
    const pending = checkSavedFrame(7);
    await jest.advanceTimersByTimeAsync(SAVED_FRAME_CHECK_TIMEOUT_MS);
    await expect(pending).resolves.toBe("프레임을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
  } finally {
    jest.useRealTimers();
  }
});
