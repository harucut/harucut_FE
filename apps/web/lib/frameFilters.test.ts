/**
 * 아이폰(WebKit)에는 `ctx.filter` 가 없어서, 고른 필터를 픽셀에 직접 굽는 길이 따로 있다.
 * 그 결과는 크롬의 `ctx.filter` 와 같아야 한다 — 같은 사진을 같은 필터로 저장했는데 기기마다
 * 색이 다르면 안 된다.
 *
 * 기대값은 손으로 계산한 것이 아니라 **크롬 151 의 `ctx.filter` 를 실측한 값**이다
 * (2026-10-05 Playwright, 9×9 단색 칸의 가운데 픽셀). W3C filter-effects 행렬로 계산한 값과도
 * ±1 안에서 맞는다. 크롬은 brightness·contrast 를 8비트 표로 버림하고 여기는 반올림해서
 * 1 안팎으로 갈린다 — 그래서 허용치가 ±2 다.
 */
import {
  applyFilterPixels,
  FOURCUT_FILTERS,
  type FourcutFilterId,
} from "@/lib/frameFilters";

type Rgb = [number, number, number];

/** 픽셀 버퍼만 가진 가짜 2D 컨텍스트. jsdom 캔버스에는 픽셀이 없다. */
function pixelCanvas(
  width: number,
  height: number,
  transform = { a: 1, d: 1, e: 0, f: 0 },
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const reads: number[][] = [];

  const ctx = {
    getTransform: () => ({ ...transform, b: 0, c: 0 }),
    getImageData(x: number, y: number, w: number, h: number) {
      reads.push([x, y, w, h]);
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row += 1) {
        const from = ((y + row) * width + x) * 4;
        data.set(pixels.subarray(from, from + w * 4), row * w * 4);
      }
      return { data, width: w, height: h };
    },
    putImageData(
      image: { data: Uint8ClampedArray; width: number; height: number },
      x: number,
      y: number,
    ) {
      for (let row = 0; row < image.height; row += 1) {
        const rowBytes = image.width * 4;
        pixels.set(
          image.data.subarray(row * rowBytes, (row + 1) * rowBytes),
          ((y + row) * width + x) * 4,
        );
      }
    },
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, pixels, reads };
}

function fill(pixels: Uint8ClampedArray, rgba: number[]) {
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
}

function rgbAt(pixels: Uint8ClampedArray, index: number): Rgb {
  return [pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2]];
}

// 허용치 안의 채널은 기대값으로 바꿔 둔다 — 실패하면 벗어난 채널만 diff 에 남는다.
function within2(actual: Rgb, expected: Rgb) {
  return actual.map((value, channel) =>
    Math.abs(value - expected[channel]) <= 2 ? expected[channel] : value,
  );
}

// 원색 셋은 행렬의 행을, 회색은 brightness·contrast 를, 피부색은 섞인 경우를,
// 검정은 contrast 의 더하는 값을 본다.
const COLORS: Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [128, 128, 128],
  [224, 172, 140],
  [0, 0, 0],
];

const CHROMIUM: Record<Exclude<FourcutFilterId, "NONE">, Rgb[]> = {
  "B&W": [
    [54, 54, 54],
    [182, 182, 182],
    [18, 18, 18],
    [128, 128, 128],
    [181, 181, 181],
    [0, 0, 0],
  ],
  BRIGHT: [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [145, 145, 145],
    [255, 197, 157],
    [0, 0, 0],
  ],
  SOFT: [
    [232, 11, 11],
    [21, 242, 21],
    [8, 8, 229],
    [137, 137, 137],
    [230, 182, 152],
    [7, 7, 7],
  ],
};

describe("필터 문자열", () => {
  // 크롬은 지금처럼 `ctx.filter` 로 굽는다. 이 문자열이 바뀌면 크롬 저장본 색도 바뀐다.
  it("미리보기와 ctx.filter 문자열이 그대로다", () => {
    expect(
      Object.fromEntries(
        FOURCUT_FILTERS.map((filter) => [filter.id, filter.cssFilter]),
      ),
    ).toEqual({
      NONE: "none",
      "B&W": "grayscale(1)",
      BRIGHT: "brightness(1.14) saturate(1.04) contrast(1.02)",
      SOFT: "brightness(1.08) contrast(0.94) saturate(0.92) blur(0.45px)",
    });

    for (const filter of FOURCUT_FILTERS) {
      expect(filter.canvasFilter).toBe(filter.cssFilter);
    }
  });
});

describe("applyFilterPixels", () => {
  it.each(Object.entries(CHROMIUM))(
    "%s 는 크롬 ctx.filter 와 ±2 안에서 같은 색을 굽는다",
    (filterId, expected) => {
      const { ctx, pixels } = pixelCanvas(COLORS.length, 1);
      COLORS.forEach((rgb, index) => pixels.set([...rgb, 255], index * 4));

      applyFilterPixels(
        ctx,
        { x: 0, y: 0, width: COLORS.length, height: 1 },
        filterId as FourcutFilterId,
      );

      expected.forEach((want, index) => {
        expect(within2(rgbAt(pixels, index), want)).toEqual(want);
      });
    },
  );

  it.each(Object.keys(CHROMIUM))("%s 는 알파를 건드리지 않는다", (filterId) => {
    const { ctx, pixels } = pixelCanvas(1, 1);
    pixels.set([224, 172, 140, 128]);

    applyFilterPixels(
      ctx,
      { x: 0, y: 0, width: 1, height: 1 },
      filterId as FourcutFilterId,
    );

    expect(pixels[3]).toBe(128);
  });

  it("고른 칸만 읽고 고친다 — 칸 밖(테두리·배경)은 그대로다", () => {
    const { ctx, pixels, reads } = pixelCanvas(4, 4);
    fill(pixels, [255, 0, 0, 255]);

    applyFilterPixels(ctx, { x: 1, y: 1, width: 2, height: 2 }, "B&W");

    expect(reads).toEqual([[1, 1, 2, 2]]);
    for (let index = 0; index < 16; index += 1) {
      const inside = [5, 6, 9, 10].includes(index);
      expect(rgbAt(pixels, index)).toEqual(inside ? [54, 54, 54] : [255, 0, 0]);
    }
  });

  // 합성 캔버스는 넓이 예산 때문에 ctx.scale 이 걸려 있다(composeFrame). getImageData 는
  // 변환을 안 타므로, 레이아웃 좌표를 그대로 넘기면 엉뚱한 칸을 굽는다.
  it("ctx.scale 이 걸려 있으면 장치 픽셀로 옮겨 그 칸만 읽는다", () => {
    const { ctx, reads } = pixelCanvas(10, 10, { a: 0.5, d: 0.5, e: 0, f: 0 });

    applyFilterPixels(ctx, { x: 4, y: 2, width: 8, height: 12 }, "SOFT");

    expect(reads).toEqual([[2, 1, 4, 6]]);
  });

  it("NONE 은 픽셀을 읽지도 않는다", () => {
    const { ctx, reads } = pixelCanvas(2, 2);

    applyFilterPixels(ctx, { x: 0, y: 0, width: 2, height: 2 }, "NONE");

    expect(reads).toEqual([]);
  });
});

/*
  결과는 모듈에 한 번 기억된다. 시험마다 등록부를 비우고 새로 불러와야 앞 시험의 답이
  남지 않는다.
*/
describe("canvasFilterSupported", () => {
  type GetContext = typeof HTMLCanvasElement.prototype.getContext;

  async function loadCanvasFilterSupported() {
    jest.resetModules();
    return (await import("@/lib/frameFilters")).canvasFilterSupported;
  }

  /** 빨간 점을 `grayscale(1)` 로 찍고 읽었을 때 돌아올 값을 정한다. */
  function fakeContext(readback: () => number[]) {
    return {
      filter: "none",
      fillStyle: "",
      fillRect() {},
      getImageData: () => ({ data: Uint8ClampedArray.from(readback()) }),
    };
  }

  function stubReadback(readback: () => number[]) {
    return jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((() => fakeContext(readback)) as unknown as GetContext);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 두 번째 값은 사파리 사생활 보호처럼 읽기에 잡음이 섞인 경우다.
  it.each([[[255, 0, 0, 255]], [[252, 3, 1, 255]]])(
    "필터가 무시돼 빨강이 남으면(WebKit) 미지원이다 — %j",
    async (readback) => {
      stubReadback(() => readback);
      const canvasFilterSupported = await loadCanvasFilterSupported();

      expect(canvasFilterSupported()).toBe(false);
    },
  );

  it("빨강이 회색으로 바뀌면(크롬) 지원이다", async () => {
    stubReadback(() => [54, 54, 54, 255]);
    const canvasFilterSupported = await loadCanvasFilterSupported();

    expect(canvasFilterSupported()).toBe(true);
  });

  // 지원으로 보면 예전 경로(ctx.filter)라 잃을 것이 없다. 미지원으로 잘못 보면 읽지 못한
  // 픽셀을 사진 위에 덮어쓴다.
  it("읽기가 막혀 잴 수 없으면 지원으로 본다", async () => {
    stubReadback(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect((await loadCanvasFilterSupported())()).toBe(true);
  });

  // 아이폰은 캔버스 메모리가 차면 컨텍스트를 안 준다. 그 한 번을 기억하면 세션 내내 필터가 빠진다.
  it("컨텍스트를 못 받은 답은 기억하지 않고 다음에 다시 잰다", async () => {
    const getContext = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((() => null) as unknown as GetContext);
    const canvasFilterSupported = await loadCanvasFilterSupported();

    expect(canvasFilterSupported()).toBe(true);

    const webkit = () => fakeContext(() => [255, 0, 0, 255]);
    getContext.mockImplementation(webkit as unknown as GetContext);
    expect(canvasFilterSupported()).toBe(false);
  });

  it("한 번 재고 기억한다", async () => {
    const getContext = stubReadback(() => [255, 0, 0, 255]);
    const canvasFilterSupported = await loadCanvasFilterSupported();

    canvasFilterSupported();
    canvasFilterSupported();

    expect(getContext).toHaveBeenCalledTimes(1);
  });
});
