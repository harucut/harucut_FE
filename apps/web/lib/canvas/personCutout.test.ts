/*
  jsdom 에는 WASM 도 WebGL 도 없다. **진짜 모델은 여기서 돌릴 수 없다.**
  그래서 라이브러리를 통째로 가짜로 갈아끼우고, 모델 없이도 틀릴 수 있는 것만 고정한다 —
  라벨 해석, 마스크 극성, 마스크 확대, 검은 배경 합성, 실패 시 되돌아갈 길, 인스턴스 재사용.

  실기기에서만 확인되는 것(세그멘테이션 품질, CPU/GPU delegate 차이, 724ms·183KB 같은 수치)은
  이 파일이 잡지 못한다. 그 근거는 personCutout.ts 상단 주석에 실측으로 남겨 뒀다.
*/

const mockVisionModule = {
  FilesetResolver: { forVisionTasks: jest.fn() },
  ImageSegmenter: { createFromOptions: jest.fn() },
};

// 실제 패키지가 설치돼 있어도 이 테스트는 가짜만 본다. virtual 이라 설치 전에도 돈다.
jest.mock("@mediapipe/tasks-vision", () => mockVisionModule, { virtual: true });

type Mod = typeof import("@/lib/canvas/personCutout");

/** 마지막으로 `getImageData` 가 돌려준 버퍼. 합성 결과를 여기서 확인한다. */
let lastImageData: { data: Uint8ClampedArray; width: number; height: number };
let putImageData: jest.Mock;
/** `toBlob` 이 돌려줄 값. null 이면 인코딩 실패. */
let nextBlob: Blob | null;
let toBlobArgs: { type?: string; quality?: number };
/** 원본 픽셀의 초깃값. 사람 픽셀이 그대로 남는지 보려고 검정이 아닌 값으로 채운다. */
const SOURCE_RGBA = [200, 100, 50, 255] as const;

type FakeMask = {
  values: Uint8Array;
  width: number;
  height: number;
};

/** 가짜 세그멘터. 라벨과 마스크를 시험별로 갈아 끼운다. */
function fakeSegmenter(opts: { labels: string[]; mask: FakeMask | null }) {
  return {
    getLabels: jest.fn(() => opts.labels),
    segment: jest.fn(
      (_image: unknown, callback: (result: unknown) => void) => {
        callback({
          categoryMask: opts.mask
            ? {
                width: opts.mask.width,
                height: opts.mask.height,
                getAsUint8Array: () => opts.mask!.values,
              }
            : undefined,
        });
      },
    ),
  };
}

/** 크기만 있으면 되는 입력. 실제 디코딩은 캔버스 스텁이 대신한다. */
function source(width: number, height: number) {
  return { width, height } as unknown as ImageBitmap;
}

beforeEach(() => {
  jest.resetModules();
  mockVisionModule.FilesetResolver.forVisionTasks.mockReset();
  mockVisionModule.ImageSegmenter.createFromOptions.mockReset();
  mockVisionModule.FilesetResolver.forVisionTasks.mockResolvedValue({
    wasmLoaderPath: "loader.js",
  });

  nextBlob = new Blob(["jpeg"], { type: "image/jpeg" });
  toBlobArgs = {};
  putImageData = jest.fn();

  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((() => ({
      drawImage: jest.fn(),
      putImageData,
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = SOURCE_RGBA[0];
          data[i + 1] = SOURCE_RGBA[1];
          data[i + 2] = SOURCE_RGBA[2];
          data[i + 3] = SOURCE_RGBA[3];
        }
        lastImageData = { data, width: w, height: h };
        return lastImageData;
      },
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);

  jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: unknown,
    ) {
      toBlobArgs = { type, quality: quality as number };
      callback(nextBlob);
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function loadModule(): Promise<Mod> {
  return import("@/lib/canvas/personCutout");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 라벨 해석 — 사람이 몇 번 카테고리인가
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePersonCategoryValue", () => {
  it("실측한 모델(['selfie'])에서 사람은 0번이다", async () => {
    const { resolvePersonCategoryValue } = await loadModule();
    // 갤럭시 A32 실측: getLabels() === ["selfie"], categoryMask 의 사람 픽셀 0 / 배경 255.
    expect(resolvePersonCategoryValue(["selfie"])).toBe(0);
  });

  it("라벨맵이 없으면 0 — 카테고리가 하나뿐인 그 경우다", async () => {
    const { resolvePersonCategoryValue } = await loadModule();
    expect(resolvePersonCategoryValue([])).toBe(0);
  });

  it("배경이 0번인 모델에서는 1을 고른다 — 극성이 뒤집히면 안 된다", async () => {
    const { resolvePersonCategoryValue } = await loadModule();
    expect(resolvePersonCategoryValue(["background", "person"])).toBe(1);
  });

  it("공백과 대소문자는 무시한다", async () => {
    const { resolvePersonCategoryValue } = await loadModule();
    expect(resolvePersonCategoryValue(["  Selfie  "])).toBe(0);
  });

  it("모르는 모델이면 null — 찍어서 맞히지 않는다", async () => {
    const { resolvePersonCategoryValue } = await loadModule();
    // selfie_multiclass 로 주소만 갈아 끼운 경우. 0번이 배경이라 넘겨짚으면 사람이 지워진다.
    expect(
      resolvePersonCategoryValue([
        "background",
        "hair",
        "body-skin",
        "face-skin",
        "clothes",
        "others",
      ]),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 검은 배경 합성 — 극성 · 확대 · 알파
// ─────────────────────────────────────────────────────────────────────────────

/** `width * height` 픽셀을 SOURCE_RGBA 로 채운 버퍼. */
function sourcePixels(width: number, height: number, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = SOURCE_RGBA[0];
    data[i + 1] = SOURCE_RGBA[1];
    data[i + 2] = SOURCE_RGBA[2];
    data[i + 3] = alpha;
  }
  return data;
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const p = (y * width + x) * 4;
  return [data[p], data[p + 1], data[p + 2], data[p + 3]];
}

const BLACK = [0, 0, 0, 255];
const KEPT = [...SOURCE_RGBA];

describe("paintBackgroundBlack", () => {
  it("사람 픽셀은 그대로, 배경 픽셀만 불투명 검정이 된다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(2, 2);

    const personPixels = paintBackgroundBlack({
      pixels,
      width: 2,
      height: 2,
      // 왼쪽 위·오른쪽 아래가 사람(0), 나머지가 배경(255) — 실측한 극성 그대로.
      mask: new Uint8Array([0, 255, 255, 0]),
      maskWidth: 2,
      maskHeight: 2,
      personCategoryValue: 0,
    });

    expect(personPixels).toBe(2);
    expect(pixelAt(pixels, 2, 0, 0)).toEqual(KEPT);
    expect(pixelAt(pixels, 2, 1, 0)).toEqual(BLACK);
    expect(pixelAt(pixels, 2, 0, 1)).toEqual(BLACK);
    expect(pixelAt(pixels, 2, 1, 1)).toEqual(KEPT);
  });

  it("사람 값을 뒤집으면 남는 픽셀도 정확히 뒤집힌다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(2, 2);

    // 사람을 255 로 잘못 잡으면 사람이 지워지고 배경만 남는다 — 실기기에서 실제로 났던 그림이다.
    const personPixels = paintBackgroundBlack({
      pixels,
      width: 2,
      height: 2,
      mask: new Uint8Array([0, 255, 255, 0]),
      maskWidth: 2,
      maskHeight: 2,
      personCategoryValue: 255,
    });

    expect(personPixels).toBe(2);
    expect(pixelAt(pixels, 2, 0, 0)).toEqual(BLACK);
    expect(pixelAt(pixels, 2, 1, 0)).toEqual(KEPT);
  });

  it("작은 마스크를 원본 크기로 늘려 읽는다 — 마스크 한 칸이 2×2 블록을 덮는다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(4, 4);

    // 2×2 마스크: 왼쪽 위만 사람. 4×4 원본에서는 왼쪽 위 2×2 = 4픽셀이 남아야 한다.
    const personPixels = paintBackgroundBlack({
      pixels,
      width: 4,
      height: 4,
      mask: new Uint8Array([0, 255, 255, 255]),
      maskWidth: 2,
      maskHeight: 2,
      personCategoryValue: 0,
    });

    expect(personPixels).toBe(4);
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      expect(pixelAt(pixels, 4, x, y)).toEqual(KEPT);
    }
    for (const [x, y] of [
      [2, 0],
      [3, 3],
      [0, 2],
      [2, 2],
    ]) {
      expect(pixelAt(pixels, 4, x, y)).toEqual(BLACK);
    }
  });

  it("배수가 아닌 크기에서도 마스크 밖을 짚지 않는다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(3, 3);

    // 3/2 = 1.5 — 마스크 한 칸이 정수 개의 픽셀로 떨어지지 않는다.
    // 전부 사람으로 채워 두면, 한 픽셀이라도 마스크 밖을 짚는 순간 undefined 를 읽어
    // 배경으로 세어 버리므로 개수가 9 미만이 된다.
    const personPixels = paintBackgroundBlack({
      pixels,
      width: 3,
      height: 3,
      mask: new Uint8Array([0, 0, 0, 0]),
      maskWidth: 2,
      maskHeight: 2,
      personCategoryValue: 0,
    });

    expect(personPixels).toBe(9);
  });

  it("배경이 투명했어도 알파를 255로 채운다 — JPEG 의 바탕색은 엔진마다 다르다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(1, 1, 0);

    paintBackgroundBlack({
      pixels,
      width: 1,
      height: 1,
      mask: new Uint8Array([255]),
      maskWidth: 1,
      maskHeight: 1,
      personCategoryValue: 0,
    });

    expect(pixelAt(pixels, 1, 0, 0)).toEqual(BLACK);
  });

  it("사람이 하나도 없으면 0을 돌려준다", async () => {
    const { paintBackgroundBlack } = await loadModule();
    const pixels = sourcePixels(2, 2);

    expect(
      paintBackgroundBlack({
        pixels,
        width: 2,
        height: 2,
        mask: new Uint8Array([255, 255, 255, 255]),
        maskWidth: 2,
        maskHeight: 2,
        personCategoryValue: 0,
      }),
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 전체 흐름 — 옵션 · 재사용 · 실패
// ─────────────────────────────────────────────────────────────────────────────

describe("cutoutPersonOnBlack", () => {
  it("검은 배경 JPEG 을 돌려주고, 배경만 칠해 캔버스에 되쓴다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["selfie"],
        mask: { values: new Uint8Array([0, 255, 255, 0]), width: 2, height: 2 },
      }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const result = await cutoutPersonOnBlack(source(2, 2));

    expect(result.blob.type).toBe("image/jpeg");
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.personPixels).toBe(2);
    // 촬영(useCaptureFlow)과 같은 품질로 굽는다.
    expect(toBlobArgs).toEqual({ type: "image/jpeg", quality: 0.92 });
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(pixelAt(lastImageData.data, 2, 0, 0)).toEqual(KEPT);
    expect(pixelAt(lastImageData.data, 2, 1, 0)).toEqual(BLACK);
  });

  it("delegate 는 CPU, 마스크는 categoryMask 하나만 켠다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["selfie"],
        mask: { values: new Uint8Array([0]), width: 1, height: 1 },
      }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    await cutoutPersonOnBlack(source(1, 1));

    const [, options] =
      mockVisionModule.ImageSegmenter.createFromOptions.mock.calls[0];
    // GPU 로 두면 이 기기에서 전부 0인 빈 마스크가 조용히 돌아온다(실측).
    expect(options.baseOptions.delegate).toBe("CPU");
    expect(options.runningMode).toBe("IMAGE");
    expect(options.outputCategoryMask).toBe(true);
    expect(options.outputConfidenceMasks).toBe(false);
    expect(options.baseOptions.modelAssetPath).toContain("selfie_segmenter");

    // wasm 은 실측한 버전에 고정한다.
    const [wasmBase] =
      mockVisionModule.FilesetResolver.forVisionTasks.mock.calls[0];
    expect(wasmBase).toContain("1.0.1");
  });

  it("모델은 한 번만 올린다 — 준비 724ms 를 장마다 다시 내지 않는다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["selfie"],
        mask: { values: new Uint8Array([0]), width: 1, height: 1 },
      }),
    );

    const { cutoutPersonOnBlack, preloadPersonCutout } = await loadModule();
    await preloadPersonCutout();
    await cutoutPersonOnBlack(source(1, 1));
    await cutoutPersonOnBlack(source(1, 1));

    expect(
      mockVisionModule.ImageSegmenter.createFromOptions,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockVisionModule.FilesetResolver.forVisionTasks,
    ).toHaveBeenCalledTimes(1);
  });

  it("모델을 못 받으면 되돌아갈 수 있는 실패를 던진다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockRejectedValue(
      new Error("offline"),
    );

    const { cutoutPersonOnBlack, isPersonCutoutUnavailable } =
      await loadModule();

    // 호출부는 이걸 잡아 손대지 않은 원본으로 계속 간다.
    const error = await cutoutPersonOnBlack(source(1, 1)).catch((e) => e);
    expect(isPersonCutoutUnavailable(error)).toBe(true);
    expect(error.reason).toBe("model-load");
  });

  it("한 번 실패한 모델은 다시 받으러 나가지 않는다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockRejectedValue(
      new Error("offline"),
    );

    const { cutoutPersonOnBlack, preloadPersonCutout } = await loadModule();

    expect(await preloadPersonCutout()).toBe(false);
    await expect(cutoutPersonOnBlack(source(1, 1))).rejects.toBeInstanceOf(
      Error,
    );
    await expect(cutoutPersonOnBlack(source(1, 1))).rejects.toBeInstanceOf(
      Error,
    );

    // 오프라인에서 4컷이 각자 다시 받으러 나갔다가 각자 기다리는 것을 막는다.
    expect(
      mockVisionModule.ImageSegmenter.createFromOptions,
    ).toHaveBeenCalledTimes(1);
  });

  it("모르는 모델이면 굽지 않는다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["background", "hair", "body-skin"],
        mask: { values: new Uint8Array([0]), width: 1, height: 1 },
      }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const error = await cutoutPersonOnBlack(source(1, 1)).catch((e) => e);
    expect(error.reason).toBe("unknown-labels");
    expect(putImageData).not.toHaveBeenCalled();
  });

  it("categoryMask 가 없으면 실패로 본다", async () => {
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({ labels: ["selfie"], mask: null }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const error = await cutoutPersonOnBlack(source(1, 1)).catch((e) => e);
    expect(error.reason).toBe("no-mask");
  });

  it("사람이 한 픽셀도 없으면 검은 사각형을 내보내지 않는다", async () => {
    // GPU delegate 가 주던 빈 마스크가 정확히 이 모양이었다 — 사람 값(0)이 하나도 없다.
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["selfie"],
        mask: { values: new Uint8Array([255, 255]), width: 2, height: 1 },
      }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const error = await cutoutPersonOnBlack(source(2, 1)).catch((e) => e);
    expect(error.reason).toBe("empty-mask");
    expect(putImageData).not.toHaveBeenCalled();
  });

  it("인코딩이 null 을 주면 실패로 본다", async () => {
    nextBlob = null;
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      fakeSegmenter({
        labels: ["selfie"],
        mask: { values: new Uint8Array([0]), width: 1, height: 1 },
      }),
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const error = await cutoutPersonOnBlack(source(1, 1)).catch((e) => e);
    expect(error.reason).toBe("encode");
  });

  it("크기를 못 읽는 사진은 모델을 돌리기 전에 거른다", async () => {
    const segmenter = fakeSegmenter({
      labels: ["selfie"],
      mask: { values: new Uint8Array([0]), width: 1, height: 1 },
    });
    mockVisionModule.ImageSegmenter.createFromOptions.mockResolvedValue(
      segmenter,
    );

    const { cutoutPersonOnBlack } = await loadModule();
    const error = await cutoutPersonOnBlack(source(0, 0)).catch((e) => e);
    expect(error.reason).toBe("source-load");
    expect(segmenter.segment).not.toHaveBeenCalled();
  });
});
