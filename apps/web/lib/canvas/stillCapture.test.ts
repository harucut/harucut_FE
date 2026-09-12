import { prepareStillCapture, takeStillBitmap } from "@/lib/canvas/stillCapture";

/*
  실기기에서 가장 흔한 조합으로 잰다 — 사진은 4:3(센서 전체), 프리뷰는 16:9.
  슬롯은 classic-4 의 1700x1200.

  견주는 값(captureCrop.ts stillBeatsVideo 기준, 슬롯에 남는 폭):
  - 영상 1920x1080          → 1530
  - 스틸 4032x3024(기능 최대) → 3213  ← 이득
  - 스틸 1280x960(기기 기본)  → 1020  ← 영상보다 못하다
*/
const VIDEO = { width: 1920, height: 1080 };
const SLOT_ASPECT = 1700 / 1200;

const CAPS_MAX = { imageWidth: { max: 4032 }, imageHeight: { max: 3024 } };

type FakeBitmap = { width: number; height: number; close: jest.Mock };

let takePhoto: jest.Mock;
let getPhotoCapabilities: jest.Mock;
/** `createImageBitmap` 이 다음에 돌려줄 크기. 기기가 실제로 내주는 스틸이다. */
let nextBitmapSize: { width: number; height: number };
let createdBitmaps: FakeBitmap[];

function track(settings: MediaTrackSettings = VIDEO) {
  return { getSettings: () => settings } as unknown as MediaStreamTrack;
}

beforeEach(() => {
  takePhoto = jest.fn(async () => new Blob());
  getPhotoCapabilities = jest.fn(async () => CAPS_MAX);
  nextBitmapSize = { width: 4032, height: 3024 };
  createdBitmaps = [];

  (globalThis as { ImageCapture?: unknown }).ImageCapture = function ImageCapture() {
    return { takePhoto, getPhotoCapabilities };
  };
  (globalThis as { createImageBitmap?: unknown }).createImageBitmap = jest.fn(async () => {
    const bitmap: FakeBitmap = { ...nextBitmapSize, close: jest.fn() };
    createdBitmaps.push(bitmap);
    return bitmap;
  });
});

afterEach(() => {
  delete (globalThis as { ImageCapture?: unknown }).ImageCapture;
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe("prepareStillCapture", () => {
  it("기능 목록의 최대 크기가 영상보다 나으면 촬영기를 준다", async () => {
    const still = await prepareStillCapture(track(), SLOT_ASPECT);
    expect(still).not.toBeNull();
    expect(still?.videoWidth).toBe(1920);
    expect(still?.videoHeight).toBe(1080);
  });

  it("기능 목록이 영상보다 못하면 null — 느린 경로를 아예 안 탄다", async () => {
    getPhotoCapabilities.mockResolvedValue({
      imageWidth: { max: 1280 },
      imageHeight: { max: 960 },
    });
    expect(await prepareStillCapture(track(), SLOT_ASPECT)).toBeNull();
  });

  it("ImageCapture 가 없는 엔진이면 null", async () => {
    delete (globalThis as { ImageCapture?: unknown }).ImageCapture;
    expect(await prepareStillCapture(track(), SLOT_ASPECT)).toBeNull();
  });
});

describe("takeStillBitmap", () => {
  it("실제 스틸이 영상보다 크면 그대로 쓴다", async () => {
    const still = await prepareStillCapture(track(), SLOT_ASPECT);
    const bitmap = await takeStillBitmap(still!);

    expect(bitmap).not.toBeNull();
    expect(bitmap?.width).toBe(4032);
    expect(createdBitmaps[0]?.close).not.toHaveBeenCalled();
  });

  /*
    기능 목록의 최대값은 **찍을 수 있는 한계**지 이번에 찍히는 크기가 아니다.
    크기를 지정하지 않은 `takePhoto()` 는 기기의 기본 스틸 해상도를 준다 — 최대값보다,
    심하면 지금 영상 프레임보다 작을 수 있다. 실측 없이 그 사진을 쓰면 화질을 올리려고
    붙인 경로가 반대로 여덟 장을 통째로 깎는다.
  */
  it("기능 목록은 크다고 했는데 실제 스틸이 영상보다 작으면 그 사진을 버린다", async () => {
    const still = await prepareStillCapture(track(), SLOT_ASPECT);
    nextBitmapSize = { width: 1280, height: 960 };

    expect(await takeStillBitmap(still!)).toBeNull();
    // 버린 비트맵은 놓아준다 — 8장을 도는 흐름이라 쌓이면 그대로 메모리다.
    expect(createdBitmaps[0]?.close).toHaveBeenCalled();
  });

  it("작다고 판명된 기기에서는 다음 컷부터 찍지도 않는다", async () => {
    const still = await prepareStillCapture(track(), SLOT_ASPECT);
    nextBitmapSize = { width: 1280, height: 960 };

    await takeStillBitmap(still!);
    expect(takePhoto).toHaveBeenCalledTimes(1);

    // 남은 일곱 컷. 스틸 크기는 같은 트랙에서 바뀌지 않으므로 다시 잴 이유가 없다.
    expect(await takeStillBitmap(still!)).toBeNull();
    expect(await takeStillBitmap(still!)).toBeNull();
    expect(takePhoto).toHaveBeenCalledTimes(1);
  });

  it("takePhoto 가 던지면 null 이지만 포기하지는 않는다 — 다음 컷은 다시 시도한다", async () => {
    const still = await prepareStillCapture(track(), SLOT_ASPECT);
    takePhoto.mockRejectedValueOnce(new Error("intermittent"));

    expect(await takeStillBitmap(still!)).toBeNull();

    const bitmap = await takeStillBitmap(still!);
    expect(bitmap?.width).toBe(4032);
    expect(takePhoto).toHaveBeenCalledTimes(2);
  });
});
