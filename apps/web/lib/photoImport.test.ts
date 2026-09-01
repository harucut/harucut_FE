/**
 * 갤러리에서 불러온 사진이 **어느 슬롯에서도 도로 확대되지 않을 만큼** 크게 남는지 지킨다.
 *
 * 불러온 사진은 `importPhotoFiles` 에서 한 번 줄인 뒤 합성 단계
 * (`lib/fourcutCompose.ts` `renderSourceForSlot`)에서 슬롯 크기 캔버스에 `drawCover` 로
 * 그려진다. `lib/canvas/draw.ts` 의 배율에는 1 상한이 없어서, 여기서 슬롯보다 작게 깎으면
 * 원본에 있던 화소를 버린 채 확대한 그림만 남는다. 실제로 상한이 2000px 이던 시절
 * wide-4(2400×1700)·grid-4·polaroid-4(1700×2400)에서 1.2배 확대가 났다.
 *
 * 그래서 아래 단언은 "긴 변이 모든 슬롯의 가장 긴 변 이상"을 못 박는다 — 상한을 다시
 * 낮추거나 더 큰 슬롯이 생기면 여기서 깨진다.
 */
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { importPhotoFiles } from "@/lib/photoImport";

/** 모든 프레임의 슬롯 중 가장 긴 변. 지금은 2400px(wide-4 가로, grid-4·polaroid-4 세로). */
const LONGEST_SLOT_EDGE = Math.max(
  ...Object.values(FRAME_LAYOUTS).flatMap((layout) =>
    layout.slots.map((slot) => Math.max(slot.width, slot.height)),
  ),
);

/** `drawCover` 와 같은 계산. 1 을 넘으면 그 슬롯에서 확대가 일어난다는 뜻. */
function coverScale(
  slot: { width: number; height: number },
  srcWidth: number,
  srcHeight: number,
) {
  return Math.max(slot.width / srcWidth, slot.height / srcHeight);
}

/** 구운 캔버스 치수 기록. `toDataURL` 이 불릴 때 담긴다. */
let baked: { width: number; height: number }[] = [];

/** 파일 이름 → 원본 픽셀 크기. 스텁 `Image` 가 여기서 크기를 꺼낸다. */
const sourceSizes = new Map<string, { width: number; height: number }>();

beforeEach(() => {
  baked = [];
  sourceSizes.clear();

  // jsdom 은 캔버스 2d 컨텍스트도 toDataURL 도 없다. 크기만 보면 되므로 최소로 흉내낸다.
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    drawImage: jest.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) {
    baked.push({ width: this.width, height: this.height });
    return "data:image/jpeg;base64,stub";
  } as typeof HTMLCanvasElement.prototype.toDataURL;

  URL.createObjectURL = jest.fn(
    (blob: Blob) => `blob:${(blob as File).name}`,
  ) as typeof URL.createObjectURL;
  URL.revokeObjectURL = jest.fn();

  // jsdom 의 Image 는 blob URL 을 못 읽어 onload 가 영원히 안 온다. 크기만 주는 스텁으로 바꾼다.
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;

    set src(value: string) {
      const size = sourceSizes.get(value.replace("blob:", ""));
      queueMicrotask(() => {
        if (!size) return this.onerror?.();
        this.naturalWidth = size.width;
        this.naturalHeight = size.height;
        this.onload?.();
      });
    }
  }
  global.Image = StubImage as unknown as typeof Image;
});

/** 지정한 픽셀 크기를 가진 JPEG 한 장을 만든다. */
function photoFile(name: string, width: number, height: number) {
  sourceSizes.set(name, { width, height });
  return new File(["stub"], name, { type: "image/jpeg" });
}

/**
 * 지원하지 않는 형식 한 장. 크기를 등록하지 않으므로, 혹시 걸러지지 않고 디코딩까지 가면
 * "읽지 못함"으로 드러난다.
 */
function unsupportedFile(name: string) {
  return new File(["stub"], name, { type: "image/heic" });
}

describe("importPhotoFiles 해상도 상한", () => {
  it("가로 원본은 가장 큰 가로 슬롯을 채울 만큼 남는다", async () => {
    const result = await importPhotoFiles([photoFile("a.jpg", 4000, 3000)]);

    expect(result.dataUrls).toHaveLength(1);
    const [{ width, height }] = baked;
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(LONGEST_SLOT_EDGE);

    // wide-4 슬롯(2400×1700)에서 확대가 없어야 한다 — 예전 상한 2000px 이 1.2배 늘리던 자리.
    for (const slot of FRAME_LAYOUTS["wide-4"].slots) {
      expect(coverScale(slot, width, height)).toBeLessThanOrEqual(1);
    }
  });

  it("세로 원본도 가장 큰 세로 슬롯을 채울 만큼 남는다", async () => {
    const result = await importPhotoFiles([photoFile("b.jpg", 3000, 4000)]);

    expect(result.dataUrls).toHaveLength(1);
    const [{ width, height }] = baked;
    expect(Math.max(width, height)).toBeGreaterThanOrEqual(LONGEST_SLOT_EDGE);

    // grid-4·polaroid-4 슬롯(1700×2400) 방어.
    for (const frameId of ["grid-4", "polaroid-4"] as const) {
      for (const slot of FRAME_LAYOUTS[frameId].slots) {
        expect(coverScale(slot, width, height)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("상한보다 작은 원본은 키우지 않는다", async () => {
    await importPhotoFiles([photoFile("c.jpg", 800, 600)]);

    expect(baked).toEqual([{ width: 800, height: 600 }]);
  });

  it("상한을 넘는 원본은 비율을 지키며 줄인다", async () => {
    await importPhotoFiles([photoFile("d.jpg", 4000, 3000)]);

    // 4:3 을 유지한 채 긴 변만 2400 으로.
    expect(baked).toEqual([{ width: 2400, height: 1800 }]);
  });
});

/**
 * 개수 상한은 **쓸 수 있는 사진에만** 건다.
 *
 * 화면(`app/shoot/upload/page.tsx`)이 먼저 자르던 시절, 앨범에서 28장을 골랐는데 앞 24장이
 * heic 면 상한이 그 24장만 통과시키고 뒤의 쓸 수 있는 4장을 잘라 버려 결과가 0장이었다.
 * 형식을 아는 곳이 거른 **뒤에** 자르면 그런 일이 없고, 자르는 자리는 여전히 디코딩 앞이다.
 */
describe("importPhotoFiles 개수 상한", () => {
  it("지원하지 않는 형식이 앞에 몰려 있어도 쓸 수 있는 사진이 살아남는다", async () => {
    const limit = 24;
    const files = [
      ...Array.from({ length: limit }, (_, index) =>
        unsupportedFile(`heic-${index}.heic`),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        photoFile(`ok-${index}.jpg`, 1200, 900),
      ),
    ];

    const result = await importPhotoFiles(files, { limit });

    // 상한(24)을 형식 거르기보다 먼저 걸면 여기가 0장이 된다.
    expect(result.dataUrls).toHaveLength(4);
    expect(result.overLimitCount).toBe(0);
    expect(result.notice).toMatch(/24장은 지원하지 않는 형식/);
    // 걸러진 것은 디코딩조차 하지 않는다("읽지 못함"으로 새지 않는다).
    expect(baked).toHaveLength(4);
    expect(result.notice).not.toMatch(/읽지 못해/);
  });

  it("지원 형식이 상한을 넘으면 넘은 만큼만 남기고 개수를 돌려준다", async () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      photoFile(`ok-${index}.jpg`, 1200, 900),
    );

    const result = await importPhotoFiles(files, { limit: 4 });

    expect(result.dataUrls).toHaveLength(4);
    expect(result.overLimitCount).toBe(2);
    // 잘린 두 장은 디코딩·재인코딩을 타지 않는다 — 상한이 막으려던 비용이 그것이다.
    expect(baked).toHaveLength(4);
  });

  it("상한을 주지 않으면 지원 형식을 전부 변환한다", async () => {
    const files = Array.from({ length: 5 }, (_, index) =>
      photoFile(`ok-${index}.jpg`, 1200, 900),
    );

    const result = await importPhotoFiles(files);

    expect(result.dataUrls).toHaveLength(5);
    expect(result.overLimitCount).toBe(0);
    expect(result.notice).toBeNull();
  });
});
