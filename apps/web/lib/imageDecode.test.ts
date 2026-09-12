/**
 * 형식 변환의 **판정과 배선**을 지킨다.
 *
 * wasm 디코드 자체는 여기서 못 돈다(jsdom 에는 canvas 도 wasm 도 없다). 그쪽은 실제
 * 브라우저로 쟀다 — 2026-09-02, 3024×3024 HEIC 한 장:
 *
 *  - Chromium: `<img>` 로는 **못 읽고**, libheif 로 디코드 184ms + JPEG 인코드 30ms.
 *    photoImport 의 축소까지 붙여 전 구간 217ms, 결과 572KB JPEG 로 다시 읽힌다(그때 상한은
 *    「긴 변 2400」이었다. 지금은 넓이 예산이라 정사각형 원본인 이 실측은 산출 치수가 같다).
 *  - WebKit: `<img>` 로 **읽는다**(3024×3024). 그래서 wasm 을 아예 안 받는다.
 *
 * 그러니 여기서 지키는 것은 **언제 wasm 을 받는가**다. 그 판정이 틀리면 되는 브라우저가
 * 0.5MB 를 헛으로 받거나(느려짐), 안 되는 브라우저가 사진을 통째로 잃는다.
 */
import {
  canUploadAsIs,
  decodeImageFile,
  looksLikeHeif,
  resetLibheifCacheForTest,
  toUploadableFile,
} from "@/lib/imageDecode";
import {
  fitCanvasScale,
  MAX_CANVAS_EDGE,
  MAX_CANVAS_PIXELS,
  MAX_TILE_PIXELS,
} from "@/lib/canvas/canvasBudget";
import {
  MAX_UPLOAD_BYTES,
  UploadValidationError,
} from "@/lib/presignedUploadApi";

/** `ftyp` 박스를 가진 12바이트 머리. 실제 HEIC 파일의 앞부분과 같은 모양이다. */
function heifHead(brand: string): Uint8Array<ArrayBuffer> {
  const head = new Uint8Array(new ArrayBuffer(12));
  head.set([0, 0, 0, 24], 0);
  head.set([...("ftyp" + brand)].map((c) => c.charCodeAt(0)), 4);
  return head;
}

function fileWithBytes(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
  type: string,
): File {
  return new File([bytes], name, { type });
}

/** PNG 시그니처 8바이트 + IHDR 길이. `ftyp` 박스가 아니라는 것을 보이는 데 쓴다. */
function pngHead(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]).buffer,
  );
}

/**
 * 브라우저가 **못 읽는** 상황을 만든다.
 *
 * jsdom 은 이미지를 아예 받으러 가지 않아서 `onload` 도 `onerror` 도 안 온다 — 실제
 * 브라우저는 못 읽으면 반드시 `onerror` 를 준다. 그 차이를 제품 코드에서 메우면 브라우저
 * 에서는 영영 안 도는 분기가 생기므로, 환경 쪽을 실제 브라우저 모양으로 맞춘다.
 */
function stubImageDecoding(
  outcome: "fails" | "succeeds",
  // 화소 수가 결과 크기를 좌우하는 시험(아래 축소)에서만 크기를 지정한다.
  size: { width: number; height: number } = { width: 100, height: 80 },
) {
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = outcome === "succeeds" ? size.width : 0;
    naturalHeight = outcome === "succeeds" ? size.height : 0;

    set src(_value: string) {
      queueMicrotask(() => {
        if (outcome === "succeeds") this.onload?.();
        else this.onerror?.();
      });
    }
  }

  Object.defineProperty(global, "Image", {
    configurable: true,
    value: StubImage,
  });
}

/** `createObjectURL` 은 jsdom 에 없다. 없으면 디코드가 시작도 못 한다. */
function stubObjectUrls() {
  Object.defineProperty(global.URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:stub",
  });
  Object.defineProperty(global.URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
}

/**
 * iOS Safari 가 그 위로는 조용히 포기한다고 **전해지는** 캔버스 넓이. 2^24 px 다.
 *
 * 확인된 값이 아니다(`lib/canvas/canvasBudget.ts` 「가정」 — 실기기로 재 본 적이 없고
 * 데스크톱 WebKit 에서는 24MP 가 멀쩡히 그려졌다). 그래도 여기 흉내에 쓰는 이유는 제품
 * 상수와 달리 **우리가 못 움직이는 숫자**라서다. 예산을 손으로 베껴 두면 예산을 내릴 때
 * 시험이 같이 내려가 아무것도 안 잡는다 — 실제로 그랬다.
 *
 * 예산 자체가 이 선 아래인지(그리고 근거 없이 더 깎이지 않았는지)는 소유자 쪽
 * `canvasBudget.test.ts` 가 양방향으로 못 박는다. 여기서는 **제품이 그 예산을 실제로
 * 쓰는가**만 본다.
 */
const IOS_CANVAS_PIXEL_LIMIT = 16_777_216;

type BakedCanvas = { width: number; height: number };

type Rect = { x: number; y: number; width: number; height: number };

type StubImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

/**
 * 화소를 실제로 들고 있는 흉내 캔버스.
 *
 * `pixels` 가 null 이면 **아직 아무것도 안 그려진** 캔버스다 — 조용히 빈 채로 남은 캔버스와
 * 같은 상태라, 시험이 그 둘을 구별할 필요가 없다.
 */
type StubCanvas = {
  width: number;
  height: number;
  readonly pixels: Uint8ClampedArray | null;
};

/**
 * 제품이 2D 컨텍스트에서 쓰는 것만 갖춘 흉내.
 *
 * 타입을 **이름으로 못 박는** 이유: 컨텍스트가 캔버스를 참조하고 캔버스가 컨텍스트를
 * 참조하는데, 둘 다 추론에 맡기면 TS 가 서로를 기다리다 any 로 떨어진다.
 */
type StubContext = {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  createImageData: (width: number, height: number) => StubImageData;
  putImageData: (
    image: StubImageData,
    dx?: number,
    dy?: number,
    dirtyX?: number,
    dirtyY?: number,
    dirtyWidth?: number,
    dirtyHeight?: number,
  ) => void;
  drawImage: (
    source: Partial<StubCanvas>,
    dx?: number,
    dy?: number,
    dw?: number,
    dh?: number,
  ) => void;
};

/** 제품이 캔버스 원소에서 쓰는 것만 갖춘 흉내. */
type StubCanvasElement = StubCanvas & {
  getContext: () => StubContext;
  toBlob: (done: (blob: Blob | null) => void) => void;
};

/** `putImageData` 한 번. 임시 캔버스는 타일마다 크기가 바뀌므로 **그때의 크기**를 남긴다. */
type PaintRecord = {
  canvas: StubCanvas;
  size: BakedCanvas;
  /** 얹은 버퍼에서 실제로 읽은 영역(dirty rect). 안 주면 버퍼 전체다. */
  read: Rect;
  image: StubImageData;
};

/** `drawImage` 한 번. 어디에서 어디로 줄여 그렸는지를 남긴다. */
type DrawRecord = {
  canvas: StubCanvas;
  size: BakedCanvas;
  from: { width: number; height: number };
  to: Rect;
};

type CanvasStub = {
  /** 구울 때마다 캔버스가 가졌던 가로·세로. */
  baked: BakedCanvas[];
  /** 구운 캔버스 자체. 결과 화소를 끝에서 읽으려고 따로 둔다. */
  bakedCanvases: StubCanvas[];
  /**
   * **만들어진 캔버스 전부.** 굽는 캔버스만 보면 푸는 캔버스가 예산을 넘어도 안 보인다 —
   * 실제로 그 구멍으로 「빈 그림이 조용히 올라간다」가 남아 있었다. 살아 있는 객체라
   * 시험이 끝난 뒤에 크기를 읽는다.
   */
  created: StubCanvas[];
  /** `putImageData` 기록. 무엇을 어디서 읽어 얹었는지 본다. */
  painted: PaintRecord[];
  /** `drawImage` 기록. **축소를 캔버스가 했는지**를 여기서 본다. */
  drawn: DrawRecord[];
  /** `createImageData` 로 만든 버퍼들. JS 쪽 큰 버퍼가 몇 개인지 센다. */
  buffers: BakedCanvas[];
};

/**
 * 캔버스를 흉내 낸다. jsdom 에는 2D 컨텍스트도 JPEG 인코더도 없다.
 *
 * `toBlob` 이 주는 크기를 **화소 수에 비례**하게 만든다 — 「줄이면 결과도 작아진다」는
 * JPEG 의 성질이 축소 시험의 전부라, 그 관계가 없으면 아무것도 지키지 못한다.
 *
 * `pixelLimit` 를 주면 **넓이가 그 선을 넘는 캔버스는 조용히 아무것도 안 한다** — `toBlob`
 * 은 null 을 주고, `putImageData`·`drawImage` 는 화소를 안 남긴다. iOS 가 그런다고 전해지는
 * 모양 그대로다(`lib/canvas/canvasBudget.ts` 「가정」). 던지지도, 빈 Blob 을 주지도 않는다.
 * 이 조용함이 지적의 핵심이라 흉내에서도 조용해야 한다.
 *
 * **화소를 실제로 옮긴다.** 예전에는 얹힌 버퍼만 모아 뒀는데, 축소를 캔버스에 맡기고
 * 나서는(타일 → `drawImage`) 목적지 캔버스가 버퍼를 통째로 받는 일이 없어 그 방식으로는
 * 결과가 비었는지 볼 수 없다. 그래서 캔버스마다 화소를 들고, 마지막에 **구운 캔버스**를
 * 본다 — 타일 한 장이 빠지거나 임시 캔버스가 상한을 넘어 조용히 비면 그 자리가 0 으로 남는다.
 * 다만 `drawImage` 는 **최근접**이다. 진짜 브라우저의 보간이 아니라 「화소가 목적지까지
 * 살아 오는가」만 보는 흉내다.
 */
function stubCanvasEncoder(
  bytesPerPixel: number,
  pixelLimit = Number.POSITIVE_INFINITY,
): CanvasStub {
  const baked: BakedCanvas[] = [];
  const bakedCanvases: StubCanvas[] = [];
  const created: StubCanvas[] = [];
  const painted: PaintRecord[] = [];
  const drawn: DrawRecord[] = [];
  const buffers: BakedCanvas[] = [];
  const realCreateElement = document.createElement.bind(document);

  jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return realCreateElement(tag);

    let width = 0;
    let height = 0;
    let pixels: Uint8ClampedArray | null = null;

    /** 그릴 면. 크기를 바꾸면 **비워지는** 것까지 실제 캔버스와 같게 둔다. */
    const surface = () => (pixels ??= new Uint8ClampedArray(width * height * 4));
    /** 상한을 넘는 캔버스는 조용히 아무것도 안 그린다. */
    const overLimit = () => width * height > pixelLimit;

    const context: StubContext = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",

      // 캔버스 크기와 무관한 버퍼다 — 제품 코드가 원본 크기 RGBA 를 여기 받는다.
      createImageData: (bufferWidth: number, bufferHeight: number) => {
        buffers.push({ width: bufferWidth, height: bufferHeight });
        return {
          width: bufferWidth,
          height: bufferHeight,
          data: new Uint8ClampedArray(bufferWidth * bufferHeight * 4),
        };
      },

      putImageData: (
        image: StubImageData,
        dx = 0,
        dy = 0,
        dirtyX = 0,
        dirtyY = 0,
        dirtyWidth = image.width,
        dirtyHeight = image.height,
      ) => {
        painted.push({
          canvas,
          size: { width, height },
          read: { x: dirtyX, y: dirtyY, width: dirtyWidth, height: dirtyHeight },
          image,
        });
        if (overLimit()) return;

        // 버퍼 밖과 캔버스 밖을 잘라 낸다 — 실제 putImageData 가 잘라 내는 그대로다.
        const from = Math.max(dirtyX, -dx, 0);
        const to = Math.min(dirtyX + dirtyWidth, image.width, width - dx);
        if (to <= from) return;

        const target = surface();
        for (let row = 0; row < dirtyHeight; row += 1) {
          const sourceY = dirtyY + row;
          const targetY = dy + sourceY;
          if (sourceY < 0 || sourceY >= image.height) continue;
          if (targetY < 0 || targetY >= height) continue;

          const at = (sourceY * image.width + from) * 4;
          target.set(
            image.data.subarray(at, at + (to - from) * 4),
            (targetY * width + dx + from) * 4,
          );
        }
      },

      drawImage: (
        source: Partial<StubCanvas>,
        dx = 0,
        dy = 0,
        dw = source.width ?? 0,
        dh = source.height ?? 0,
      ) => {
        drawn.push({
          canvas,
          size: { width, height },
          from: { width: source.width ?? 0, height: source.height ?? 0 },
          to: { x: dx, y: dy, width: dw, height: dh },
        });
        if (overLimit()) return;

        // `<img>` 흉내에는 화소가 없다 — 네이티브로 읽는 길의 시험은 크기만 본다.
        const from = source.pixels;
        if (!from || !source.width || !source.height) return;

        const target = surface();
        const sameWidth = dw === source.width && dx >= 0 && dx + dw <= width;

        /*
          목적지 칸마다 원본 칸을 미리 계산해 둔다. 화소마다 나눗셈을 하면 16MP 짜리
          시험(아래 「넓이가 예산을 넘어도…」) 하나가 몇 초씩 늘어난다.
        */
        const columns = sameWidth ? null : new Int32Array(dw);
        if (columns) {
          for (let column = 0; column < dw; column += 1) {
            columns[column] = Math.min(
              source.width - 1,
              Math.floor((column * source.width) / dw),
            );
          }
        }
        const first = Math.max(0, -dx);
        const last = Math.min(dw, width - dx);

        for (let row = 0; row < dh; row += 1) {
          const targetY = dy + row;
          if (targetY < 0 || targetY >= height) continue;
          const sourceY = Math.min(
            source.height - 1,
            Math.floor((row * source.height) / dh),
          );
          const sourceRow = sourceY * source.width;
          const targetRow = targetY * width;

          // 1:1 로 그리는 자리(굽기)는 줄 단위로 옮긴다.
          if (!columns) {
            const at = sourceRow * 4;
            target.set(
              from.subarray(at, at + source.width * 4),
              (targetRow + dx) * 4,
            );
            continue;
          }

          for (let column = first; column < last; column += 1) {
            const at = (sourceRow + columns[column]) * 4;
            const into = (targetRow + dx + column) * 4;
            target[into] = from[at];
            target[into + 1] = from[at + 1];
            target[into + 2] = from[at + 2];
            target[into + 3] = from[at + 3];
          }
        }
      },
    };

    const canvas: StubCanvasElement = {
      get width() {
        return width;
      },
      set width(value: number) {
        width = value;
        pixels = null;
      },
      get height() {
        return height;
      },
      set height(value: number) {
        height = value;
        pixels = null;
      },
      get pixels() {
        return pixels;
      },
      getContext: () => context,
      toBlob: (done: (blob: Blob | null) => void) => {
        baked.push({ width, height });
        bakedCanvases.push(canvas);

        const area = width * height;
        if (area > pixelLimit) return done(null);
        done(new Blob([new Uint8Array(Math.round(area * bytesPerPixel))]));
      },
    };

    created.push(canvas);
    return canvas as unknown as HTMLElement;
  });

  return { baked, bakedCanvases, created, painted, drawn, buffers };
}

describe("looksLikeHeif", () => {
  /*
    아이폰이 실제로 쓰는 브랜드는 `heic` 와 `mif1` 둘 다다. 하나만 보면 절반이 샌다.
  */
  it.each(["heic", "heix", "mif1", "msf1", "hevc"])(
    "%s 브랜드를 HEIF 로 본다",
    (brand) => {
      expect(looksLikeHeif(heifHead(brand))).toBe(true);
    },
  );

  it("대문자 브랜드도 같이 본다", () => {
    expect(looksLikeHeif(heifHead("HEIC"))).toBe(true);
  });

  /*
    `ftyp` 를 가진 다른 컨테이너가 많다 — mp4·mov 가 같은 구조다. 브랜드까지 봐야
    동영상을 사진으로 착각하지 않는다.
  */
  it.each(["mp41", "isom", "qt  ", "avif"])(
    "%s 브랜드는 HEIF 가 아니다",
    (brand) => {
      expect(looksLikeHeif(heifHead(brand))).toBe(false);
    },
  );

  it("ftyp 박스가 아니면 아니다", () => {
    // PNG 시그니처.
    const png = pngHead();
    expect(looksLikeHeif(png)).toBe(false);
  });

  it("12바이트가 안 되면 아니다", () => {
    expect(looksLikeHeif(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))).toBe(
      false,
    );
  });
});

describe("canUploadAsIs", () => {
  it("백엔드가 받는 형식은 그대로 올린다", () => {
    expect(canUploadAsIs(new File(["x"], "a.png", { type: "image/png" }))).toBe(
      true,
    );
    expect(canUploadAsIs(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toBe(
      true,
    );
  });

  it("HEIC 는 그대로는 못 올린다", () => {
    expect(canUploadAsIs(new File(["x"], "a.heic", { type: "image/heic" }))).toBe(
      false,
    );
  });
});

describe("decodeImageFile", () => {
  beforeEach(() => {
    resetLibheifCacheForTest();
    stubImageDecoding("fails");
    stubObjectUrls();
  });

  afterEach(() => {
    jest.dontMock("libheif-js/wasm-bundle");
  });

  /*
    브라우저가 읽을 수 있으면 **wasm 을 안 받는다.** WebKit(iOS)이 이 길로 간다 —
    HEIC 를 스스로 읽으므로 0.5MB 를 받을 이유가 없다.
  */
  it("브라우저가 읽으면 그대로 쓴다", async () => {
    stubImageDecoding("succeeds");

    const decoded = await decodeImageFile(
      fileWithBytes(heifHead("heic"), "photo.heic", "image/heic"),
    );

    expect(decoded).toEqual(
      expect.objectContaining({ width: 100, height: 80 }),
    );
  });

  /*
    ── 핵심: 바이트가 HEIF 가 아니면 wasm 을 **받지 않는다** ──

    이걸 놓치면 사용자가 mp4 나 깨진 파일을 골랐을 때도 0.5MB 짜리 디코더를 받는다.
    받아 봐야 어차피 못 읽는다.
  */
  it("HEIF 가 아니면 디코더를 받지 않고 null 을 준다", async () => {
    const notHeif = fileWithBytes(pngHead(), "broken.png", "image/png");

    await expect(decodeImageFile(notHeif)).resolves.toBeNull();
  });

  it("HEIF 인데 디코더를 못 받으면 null 을 준다", async () => {
    // 오프라인이거나 청크를 못 받은 경우. 던지지 않고 「읽지 못했다」로 돌아와야
    // 호출부가 장수를 세어 사용자에게 알린다.
    const heic = fileWithBytes(heifHead("heic"), "photo.heic", "");

    await expect(decodeImageFile(heic)).resolves.toBeNull();
  });

  /*
    ── 실패한 로드를 캐시에 남기지 않는다 ──

    첫 HEIC 를 고를 때 오프라인이거나 청크가 안 오면 거절된 Promise 가 캐시에 남는다.
    그러면 연결이 돌아와 다시 골라도 같은 거절을 그 자리에서 되쓰므로, 새로고침 전까지
    이 기기의 HEIC 변환이 통째로 막힌다 — `decodeImageFile` 이 null 로 삼켜 이유도 안 보인다.
  */
  it("디코더 로드가 실패해도 다음 선택에서 다시 받는다", async () => {
    let loads = 0;
    let offline = true;
    jest.doMock("libheif-js/wasm-bundle", () => {
      loads += 1;
      if (offline) throw new Error("chunk load failed");
      // 로드가 됐다는 것만 보면 되므로 디코더는 빈 껍데기다.
      return {
        HeifDecoder: class {
          decode = () => [];
        },
      };
    });

    const heic = fileWithBytes(heifHead("heic"), "photo.heic", "");

    await expect(decodeImageFile(heic)).resolves.toBeNull();
    expect(loads).toBe(1);

    offline = false;
    await expect(decodeImageFile(heic)).resolves.toBeNull();
    expect(loads).toBe(2);
  });

  /*
    아이클라우드에 있어 아직 안 내려받은 사진이다. 고를 수는 있는데 바이트를 읽으려 하면
    거절한다. 이 예외가 밖으로 나가면 `importPhotoFiles` 를 `finally` 로만 감싼 촬영 화면이
    이 한 장 대신 **같이 고른 사진 전부**를 버린다.
  */
  it("머리를 못 읽는 파일도 그 한 장만 null 이다", async () => {
    const unreadable = fileWithBytes(
      heifHead("heic"),
      "photo.heic",
      "image/heic",
    );
    Object.defineProperty(unreadable, "slice", {
      configurable: true,
      value: () => ({
        arrayBuffer: () => Promise.reject(new Error("NotReadableError")),
      }),
    });

    await expect(decodeImageFile(unreadable)).resolves.toBeNull();
  });
});

describe("toUploadableFile", () => {
  beforeEach(() => {
    resetLibheifCacheForTest();
    stubObjectUrls();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /*
    이미 올릴 수 있는 파일은 **손대지 않는다.** 다시 구우면 화질만 떨어지고, PNG 의
    투명도처럼 잃으면 안 되는 것을 잃는다.
  */
  it("이미 올릴 수 있는 파일은 그대로 돌려준다", async () => {
    const png = new File(["x"], "sticker.png", { type: "image/png" });

    await expect(toUploadableFile(png)).resolves.toBe(png);
  });

  /*
    못 읽는 형식은 **올리기 전에** 던진다. 예외 종류가 `presignedUploadApi` 와 같아야
    화면이 이미 가진 한국어 안내가 그대로 뜬다 — 새 문구를 만들면 같은 말을 하는 자리가
    두 곳이 된다.
  */
  it("못 읽는 형식이면 업로드 검증 예외를 던진다", async () => {
    stubImageDecoding("fails");

    const weird = new File(["x"], "clip.mp4", { type: "video/mp4" });

    await expect(toUploadableFile(weird)).rejects.toBeInstanceOf(
      UploadValidationError,
    );
  });

  /*
    ── 핵심: 변환 결과가 **올릴 수 있는 크기** 안에 든다 ──

    결이 고운 사진은 화소를 그대로 두고 다시 구우면 10MiB 를 넘긴다. 그러면
    `uploadToS3WithPresigned` 가 발급 전에 거절해서, 여기까지 와 놓고 마지막 단계에서만
    실패한다 — 아이폰 사진을 지원한다고 해 놓고 안 되는 자리다.

    크기 규칙만 보려고 캔버스 넓이 상한 **안쪽** 사진(14.4MP)을 쓴다. 상한을 넘는 사진을
    쓰면 첫 배율이 이미 1이 아니라 두 규칙이 섞여, 어느 쪽이 줄인 것인지 못 가린다.
  */
  it("한도를 넘는 사진은 들어올 때까지 줄여서 굽는다", async () => {
    stubImageDecoding("succeeds", { width: 3800, height: 3800 });
    // 화소당 0.75바이트 — 결이 고운 사진의 품질 0.92 JPEG 다. 14.4MP 면 약 10.8MB 라 넘긴다.
    const { baked } = stubCanvasEncoder(0.75, IOS_CANVAS_PIXEL_LIMIT);

    const heic = new File(["x"], "IMG_0001.heic", { type: "image/heic" });
    const converted = await toUploadableFile(heic);

    expect(converted.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(converted.name).toBe("IMG_0001.jpg");
    // 원본 화소로 한 번 굽고, 넘쳐서 더 작게 다시 구웠다.
    expect(baked).toHaveLength(2);
    expect(baked[0]).toEqual({ width: 3800, height: 3800 });
    expect(baked[1].width).toBeLessThan(3800);
  });

  /*
    ── 핵심(회귀): 고화소 사진을 **전체 크기로 먼저 굽지 않는다** ──

    막는 사고(가정 위에 서 있다 — `lib/canvas/canvasBudget.ts` 「가정」): iOS 는 캔버스가
    상한을 넘으면 오류 없이 `toBlob` 에 null 을 준다고 **전해진다.** 예전 코드는 크기를
    알기도 전에 `scale = 1` 로 원본 화소 캔버스를 먼저 잡았으므로, 그 이야기가 맞다면
    크기 기반 축소 루프는 한 번도 못 돈 채 「지원하지 않는 형식」으로 거절된다 —
    WebKit 이 HEIC 를 **스스로 읽는데도** 고화소 아이폰 사진만 골라 실패하는 모양이다.
    프로필 사진·프레임 배경으로 가장 흔히 고르는 것이 하필 그 사진이다.
  */
  it("캔버스 예산을 넘는 사진은 첫 굽기부터 줄인다", async () => {
    // 아이폰 48MP(8064×6048). 예산을 조금이라도 넘으면 null 을 주는 캔버스다.
    stubImageDecoding("succeeds", { width: 8064, height: 6048 });
    const { baked } = stubCanvasEncoder(0.4, IOS_CANVAS_PIXEL_LIMIT);

    const heic = new File(["x"], "IMG_0003.heic", { type: "image/heic" });
    const converted = await toUploadableFile(heic);

    expect(converted.name).toBe("IMG_0003.jpg");
    expect(converted.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    // 한 번에 예산 안으로 들어갔다 — 굽다 실패한 뒤 줄인 것이 아니다.
    expect(baked).toHaveLength(1);

    /*
      ── 못: **공용 예산(`fitCanvasScale`)이 정한 그 크기**여야 한다 ──

      「예산보다 작다」만 보면 첫 배율을 `Math.min(1, 4000 / 가장긴변)` 같은 딴 식으로
      바꿔도 통과한다. 그래서 자릿수까지 소유자에게 물어 맞춘다. 이 단언이 깨지는 경우는
      둘뿐이다: 제품이 공용 예산을 안 쓰게 됐거나, 내림/올림을 바꿨거나.
    */
    const scale = fitCanvasScale(8064, 6048);
    expect(baked[0]).toEqual({
      width: Math.floor(8064 * scale),
      height: Math.floor(6048 * scale),
    });

    const [first] = baked;
    expect(first.width * first.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(Math.max(first.width, first.height)).toBeLessThanOrEqual(
      MAX_CANVAS_EDGE,
    );
    /*
      반대쪽 못 두 개.
       - 예산을 다 쓰지 않고 더 깎으면 프레임 배경이 이유 없이 흐려진다. 「무조건 작게」로
         고치는 수정을 여기서 막는다(이 사진은 넓이 쪽에 걸리므로 넓이를 꽉 채워야 한다).
       - 배율을 한 변에만 걸면 사진이 늘어난다. 비율이 4:3 그대로여야 한다.
    */
    expect(first.width * first.height).toBeGreaterThan(MAX_CANVAS_PIXELS * 0.99);
    expect(first.width / first.height).toBeCloseTo(8064 / 6048, 2);
  });

  /*
    ── 줄일 때 **올림으로 예산을 도로 넘지 않는다** ──

    막는 사고: 예산에 딱 맞춘 배율은 올림 한 번에 도로 예산을 넘는다(맞춘 결과가 예산
    바로 아래라 한 줄만 붙어도 넘어간다). 지금은 기기 쪽 선이 예산 위라 당장 터지지는
    않지만, 예산과 그 선 사이가 좁아지면 그때 조용히 빈 캔버스가 된다 —
    `composeFrame.ts` 가 같은 계산에서 같은 이유로 내림한다.

    숫자는 예산을 따라 움직이므로 여기 적지 않는다. 예산과 기기 선의 관계는
    `canvasBudget.test.ts` 가 양방향으로 잡는다.
  */
  it("예산에 맞출 때 올림으로 예산을 도로 넘지 않는다", async () => {
    stubImageDecoding("succeeds", { width: 6000, height: 4000 });
    const { baked } = stubCanvasEncoder(0.4, IOS_CANVAS_PIXEL_LIMIT);

    await toUploadableFile(
      new File(["x"], "IMG_0005.heic", { type: "image/heic" }),
    );

    expect(baked).toHaveLength(1);
    expect(baked[0].width * baked[0].height).toBeLessThanOrEqual(
      MAX_CANVAS_PIXELS,
    );
  });

  /*
    반대쪽도 지킨다. 두 상한 어느 쪽에도 안 걸리는 사진의 화소를 줄이면 프로필·프레임
    자산이 이유 없이 흐려진다 — 넘지 않으면 예전과 똑같이 원본 화소로 한 번만 굽는다.
  */
  it("한도 안에 드는 사진은 화소를 안 줄인다", async () => {
    stubImageDecoding("succeeds", { width: 3024, height: 3024 });
    const { baked } = stubCanvasEncoder(0.5, IOS_CANVAS_PIXEL_LIMIT);

    const heic = new File(["x"], "IMG_0002.heic", { type: "image/heic" });
    await toUploadableFile(heic);

    expect(baked).toEqual([{ width: 3024, height: 3024 }]);
  });
});

/**
 * ── wasm 으로 푸는 길(안드로이드 Chromium)에서 **푸는 캔버스** ──
 *
 * 굽는 쪽만 예산에 맞췄을 때 남아 있던 구멍이다. `decodeWithLibheif` 가 원본 화소 그대로
 * 캔버스를 잡고 있었으므로, 진짜 상한이 예산과 원본 사이인 기기에서는 **푸는 캔버스만**
 * 상한을 넘는다. 그런 캔버스에 putImageData 는 오류 없이 아무것도 안 그린다고 전해지고
 * (`lib/canvas/canvasBudget.ts` 「가정」), 그러면 그 빈 캔버스를 예산 안 크기로 다시 구워
 * **빈 그림이 조용히 올라간다.** 굽는 쪽을 고치기 전에는 인코딩도 같이 실패해 사용자가
 * 거절을 봤다 — 보이던 실패가 조용한 데이터 손실로 바뀌는 구간이라 여기서 못 박는다.
 *
 * 진짜 wasm 은 jsdom 에서 못 돈다. 그래서 libheif 자리에 「준 버퍼를 한 가지 색으로 채우는
 * 것」을 끼운다. 색이 목적지까지 살아 오는지를 보면 빈 그림과 구별된다.
 */
describe("HEIC 를 wasm 으로 푸는 길", () => {
  beforeEach(() => {
    resetLibheifCacheForTest();
    // 브라우저가 못 읽어야 이 길로 온다. 안드로이드 Chromium 이 그렇다.
    stubImageDecoding("fails");
    stubObjectUrls();
  });

  afterEach(() => {
    jest.dontMock("libheif-js/wasm-bundle");
    jest.restoreAllMocks();
  });

  /** 채우는 색. 0 이 아닌 값이라 「아무것도 안 그린 버퍼」와 섞이지 않는다. */
  const FILL: [number, number, number, number] = [12, 240, 90, 255];

  function stubLibheif(width: number, height: number) {
    /*
      `doMock` 은 **아직 안 불러온 모듈**에만 걸린다. 앞선 시험이 진짜 libheif 를 한 번
      불러왔으면 등록부에 그것이 남아 흉내가 무시된다 — 실제로 그래서 진짜 wasm 이 돌고
      「File size too small」로 실패했다. 등록부를 비우고 건다.
    */
    jest.resetModules();
    jest.doMock("libheif-js/wasm-bundle", () => ({
      HeifDecoder: class {
        decode() {
          return [
            {
              get_width: () => width,
              get_height: () => height,
              display: (
                target: { data: Uint8ClampedArray },
                done: (result: unknown) => void,
              ) => {
                for (let i = 0; i < target.data.length; i += 4) {
                  target.data[i] = FILL[0];
                  target.data[i + 1] = FILL[1];
                  target.data[i + 2] = FILL[2];
                  target.data[i + 3] = FILL[3];
                }
                done(target);
              },
            },
          ];
        }
      },
    }));
  }

  /** 캔버스에 남은 화소 하나. 아직 아무것도 안 그려졌으면 빈 배열이다. */
  function pixelAt(canvas: StubCanvas, index: number) {
    const at = index * 4;
    if (!canvas.pixels) return [];
    return [
      canvas.pixels[at],
      canvas.pixels[at + 1],
      canvas.pixels[at + 2],
      canvas.pixels[at + 3],
    ];
  }

  /**
   * 캔버스 화소가 **전부** 이 색인가. 아니면 처음 어긋난 자리를 돌려준다.
   *
   * 귀퉁이만 보면 타일 한 장이 빠진 것을 놓친다 — 조용한 데이터 손실이 그런 모양(가운데
   * 한 칸만 까맣게)으로도 나올 수 있어서, 감당되는 크기의 시험에서는 전부 본다.
   */
  function firstPixelUnlike(canvas: StubCanvas, color: number[]) {
    const { pixels, width, height } = canvas;
    if (!pixels) return { at: 0, got: [] as number[] };

    for (let at = 0; at < width * height; at += 1) {
      const i = at * 4;
      if (
        pixels[i] !== color[0] ||
        pixels[i + 1] !== color[1] ||
        pixels[i + 2] !== color[2] ||
        pixels[i + 3] !== color[3]
      ) {
        return { at, got: pixelAt(canvas, at) };
      }
    }
    return null;
  }

  /*
    한 변이 상한을 넘는 파노라마를 쓴다. 넓이 예산은 통과하므로 **변 상한만으로** 축소가
    걸리고, 원본 버퍼가 작아 시험이 싸다(넓이 쪽으로 걸리게 하려면 6천만 바이트짜리
    버퍼를 만들어야 한다 — 아래에 그 시험도 따로 있다).
  */
  it("한 변이 상한을 넘으면 푸는 캔버스부터 줄여 잡는다", async () => {
    stubLibheif(7000, 100);
    const { created, painted, drawn, baked, bakedCanvases } = stubCanvasEncoder(
      0.4,
      IOS_CANVAS_PIXEL_LIMIT,
    );

    const converted = await toUploadableFile(
      fileWithBytes(heifHead("heic"), "IMG_0007.heic", "image/heic"),
    );

    expect(converted.name).toBe("IMG_0007.jpg");

    /*
      **그린 순간의 크기가 전부** 예산 안이다. 하나만 새도 조용한 빈 그림이 된다.

      만든 캔버스의 **마지막 크기**만 보면 새로 생긴 임시 타일 캔버스를 놓친다 — 그 캔버스는
      타일마다 크기가 바뀌어서, 중간에 상한을 넘겼더라도 끝나고 보면 작아져 있다.
    */
    expect(painted.length + drawn.length).toBeGreaterThan(0);
    for (const { size } of [...painted, ...drawn]) {
      expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(
        MAX_CANVAS_EDGE,
      );
    }

    // 크기는 공용 예산이 정한 그 값이어야 한다(딴 식으로 바꾸면 여기서 깨진다).
    const scale = fitCanvasScale(7000, 100);
    const expected = {
      width: Math.floor(7000 * scale),
      height: Math.floor(100 * scale),
    };
    expect(created[0]).toEqual(expect.objectContaining(expected));
    // 줄인 캔버스를 다시 원본 크기로 부풀려 굽지도 않는다.
    expect(baked).toEqual([expected]);

    /*
      줄이면서 **화소를 잃지 않았다.** 크기만 보면 「빈 버퍼를 얹었다」도 통과한다 —
      조용한 데이터 손실이 정확히 그 모양이라 색까지 본다.

      보는 자리를 「얹은 버퍼」에서 **구운 캔버스**로 옮겼다. 축소를 타일 `drawImage` 에
      맡기고부터는 목적지가 버퍼를 통째로 받는 일이 없어서, 얹은 것만 봐서는 목적지가
      비었는지 알 수 없다. 여기서는 굽는 캔버스의 화소를 **하나도 빠짐없이** 본다 —
      타일 한 장이 빠지거나 임시 캔버스가 조용히 비면 그 자리가 0 으로 남는다.
    */
    const [bakedCanvas] = bakedCanvases;
    expect(bakedCanvas).toEqual(expect.objectContaining(expected));
    expect(firstPixelUnlike(bakedCanvas, FILL)).toBeNull();
  });

  /*
    ── 핵심(이번 회): 큰 사진을 **JS 화소 루프로 줄이지 않는다** ──

    무엇이 잘못됐었나: 직전 라운드에 넣은 `shrinkPixels` 는 원본 화소를 JS 로 전부 훑어
    상자 평균을 냈다. 48MP 사진이면 4,800만 번의 중첩 반복이 메인 스레드에서 통째로 돌고
    (이 기계 데스크톱 Node 로 그 루프만 떼어 재니 8064×6048 에 0.55초였다 — 이 길이 필요한
    폰 Chromium 은 더 느리다, 실기기로는 재지 못했다), 그동안 원본 버퍼 186MB 와 목적지
    버퍼 61MB 를 **같이** 들고 있었다.

    루프가 사라진 것 자체는 시험으로 못 잰다. 대신 **그 루프가 있으면 반드시 남는 자국**을
    못으로 박는다 — 축소를 캔버스가 했는가, 한 번에 드는 임시 캔버스가 타일 예산 안인가,
    JS 로 만든 큰 버퍼가 원본 하나뿐인가.
  */
  it("예산을 넘는 사진은 타일로 잘라 캔버스가 줄이게 한다", async () => {
    stubLibheif(7000, 100);
    const { created, painted, drawn, buffers } = stubCanvasEncoder(
      0.4,
      IOS_CANVAS_PIXEL_LIMIT,
    );

    await toUploadableFile(
      fileWithBytes(heifHead("heic"), "IMG_0010.heic", "image/heic"),
    );

    const scale = fitCanvasScale(7000, 100);
    const target = {
      width: Math.floor(7000 * scale),
      height: Math.floor(100 * scale),
    };

    // 푸는 캔버스에 타일이 **그려졌다.** 한 장도 없으면 JS 가 줄였다는 뜻이다.
    const tiles = drawn.filter((record) => record.canvas === created[0]);
    expect(tiles.length).toBeGreaterThan(1);

    // 타일의 목적지 사각형이 경계 안에서 빈틈없이 목적지 전체가 된다.
    for (const { to } of tiles) {
      expect(to.x).toBeGreaterThanOrEqual(0);
      expect(to.y).toBeGreaterThanOrEqual(0);
      expect(to.x + to.width).toBeLessThanOrEqual(target.width);
      expect(to.y + to.height).toBeLessThanOrEqual(target.height);
    }
    expect(tiles.reduce((sum, { to }) => sum + to.width * to.height, 0)).toBe(
      target.width * target.height,
    );

    /*
      임시 캔버스는 **타일 예산 안**이다 — 한 번에 드는 추가 메모리가 여기 묶인다.
      원본 폭 전체로 띠를 뜨는 수정(아이폰 48MP 면 8064px 짜리 띠)은 여기서 걸린다.
    */
    const temporary = painted.filter((record) => record.canvas !== created[0]);
    expect(temporary).toHaveLength(tiles.length);
    /*
      타일 넓이는 `MAX_TILE_PIXELS` **언저리**다. 정확히 그 이하인 것은 아니다 — 타일의
      원본 크기는 목적지 칸 수 × 배율을 정수로 되돌린 값이라, 내림 때문에 계산한 칸보다
      원본 화소 한 줄씩 커질 수 있다(가로세로 각각 한 줄이면 넓이가 0.1% 가량 넘친다).
      「예산 이하」로 단언하면 그 사실이 아닌 것을 불변식으로 적는 셈이라, 실제로 지키는
      것 — 타일이 예산 언저리에 머무르고 **변 상한은 반드시 지킨다** — 을 적는다.
      변 상한이 진짜 위험한 쪽이다. 그걸 넘기면 임시 캔버스가 조용히 빈다.
    */
    for (const { size } of temporary) {
      expect(size.width * size.height).toBeLessThan(MAX_TILE_PIXELS * 1.05);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(
        MAX_CANVAS_EDGE,
      );
    }

    // 원본을 빠짐없이 한 번씩 읽었다. 덜 읽으면 그만큼이 목적지에서 빈다.
    expect(
      temporary.reduce((sum, { read }) => sum + read.width * read.height, 0),
    ).toBe(7000 * 100);

    /*
      JS 로 만든 버퍼는 **원본 하나뿐**이다. 예전에는 목적지 크기 버퍼를 하나 더 만들어
      화소를 옮겨 담았다(48MP 면 61MB). 타일용 버퍼를 따로 만드는 수정도 여기서 걸린다.
    */
    expect(buffers).toEqual([{ width: 7000, height: 100 }]);

    // 캔버스는 셋뿐이다 — 푸는 것, 타일 한 장, 굽는 것. 타일마다 새로 만들지 않는다.
    expect(created).toHaveLength(3);
  });

  /*
    넓이 쪽으로 걸리는 경우. 넓이 예산을 넘기려면 원본 버퍼가 6천만 바이트를 넘어야 해서
    (RGBA) 이 시험만 67MB 짜리 원본을 만든다. 남겨 두는 이유: 변 상한을 나중에 걷어내도
    넓이 쪽 못은 남아야 한다.

    「이 기계에서 약 3.5초」라고 적혀 있던 자리다. **다시 쟀다** — jest 가 적는 시험별
    시간으로 고치기 전이 4.1초, JS 화소 루프와 목적지 61MB 버퍼가 사라진 지금이 0.24초다.
    20초 제한은 지금 필요해서가 아니라 느린 기계를 위한 여유로 남긴다.
  */
  it("넓이가 예산을 넘어도 푸는 캔버스부터 줄여 잡는다", async () => {
    // 6000×2800 = 16.8MP. 긴 변은 상한과 같아 걸리지 않고 넓이만 걸린다.
    stubLibheif(6000, 2800);
    const { created, painted, bakedCanvases } = stubCanvasEncoder(
      0.1,
      IOS_CANVAS_PIXEL_LIMIT,
    );

    await toUploadableFile(
      fileWithBytes(heifHead("heic"), "IMG_0008.heic", "image/heic"),
    );

    const scale = fitCanvasScale(6000, 2800);
    expect(scale).toBeLessThan(1);
    expect(created[0]).toEqual(
      expect.objectContaining({
        width: Math.floor(6000 * scale),
        height: Math.floor(2800 * scale),
      }),
    );
    expect(created[0].width * created[0].height).toBeLessThanOrEqual(
      MAX_CANVAS_PIXELS,
    );

    // 타일이 원본을 빠짐없이 읽었다. 여기는 **세로로도** 나뉜다(위 파노라마는 한 줄이다).
    const temporary = painted.filter((record) => record.canvas !== created[0]);
    expect(new Set(temporary.map(({ read }) => read.y)).size).toBeGreaterThan(1);
    // 타일 예산이 실제로 죄는 자리다 — 여기 타일은 예산 언저리까지 찬다(정확히 그 이하는
    // 아니다. 위 「예산 언저리」 주석과 같은 이유다).
    for (const { size } of temporary) {
      expect(size.width * size.height).toBeLessThan(MAX_TILE_PIXELS * 1.05);
    }
    expect(
      temporary.reduce((sum, { read }) => sum + read.width * read.height, 0),
    ).toBe(6000 * 2800);

    /*
      화소가 끝까지 살아 왔다. 여기서는 **네 귀퉁이만** 본다 — 16MP 를 전부 훑으면 이
      시험 하나가 그만큼 더 든다. 빈틈은 바로 위 넓이 합이 잡는다.
    */
    const [bakedCanvas] = bakedCanvases;
    const last = bakedCanvas.width * bakedCanvas.height - 1;
    for (const at of [
      0,
      bakedCanvas.width - 1,
      last - bakedCanvas.width + 1,
      last,
    ]) {
      expect(pixelAt(bakedCanvas, at)).toEqual(FILL);
    }
  }, 20_000);

  /*
    반대쪽. 예산 안에 드는 사진은 예전 그대로 **원본 화소 그대로** 푼다 — 줄이지도,
    버퍼를 한 번 더 복사하지도 않는다(그 복사는 고화소 사진에서 수십 MB 다).
  */
  it("예산 안에 드는 사진은 원본 화소 그대로 푼다", async () => {
    stubLibheif(1200, 900);
    const { created, painted, drawn, baked, bakedCanvases, buffers } =
      stubCanvasEncoder(0.4, IOS_CANVAS_PIXEL_LIMIT);

    await toUploadableFile(
      fileWithBytes(heifHead("heic"), "IMG_0009.heic", "image/heic"),
    );

    expect(created[0]).toEqual(
      expect.objectContaining({ width: 1200, height: 900 }),
    );
    expect(baked).toEqual([{ width: 1200, height: 900 }]);

    // 버퍼를 통째로 한 번 얹는다 — 자르지도(타일) 줄이지도 않는다.
    expect(painted).toHaveLength(1);
    expect(painted[0].image).toEqual(
      expect.objectContaining({ width: 1200, height: 900 }),
    );
    expect(painted[0].read).toEqual({ x: 0, y: 0, width: 1200, height: 900 });
    expect(buffers).toEqual([{ width: 1200, height: 900 }]);

    /*
      **타일을 만들지 않는다.** 예산 안에 드는 사진까지 잘라 그리면 이유 없이 브라우저
      보간을 한 번 더 거치고(화질) 캔버스를 하나 더 잡는다. 푸는 캔버스에 drawImage 가
      없어야 하고, 캔버스도 푸는 것·굽는 것 둘뿐이어야 한다.
    */
    expect(drawn.filter((record) => record.canvas === created[0])).toHaveLength(
      0,
    );
    expect(created).toHaveLength(2);

    // 그래도 화소는 굽는 캔버스까지 그대로 온다.
    expect(firstPixelUnlike(bakedCanvases[0], FILL)).toBeNull();
  });
});
