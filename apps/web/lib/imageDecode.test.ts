/**
 * 형식 변환의 **판정과 배선**을 지킨다.
 *
 * wasm 디코드 자체는 여기서 못 돈다(jsdom 에는 canvas 도 wasm 도 없다). 그쪽은 실제
 * 브라우저로 쟀다 — 2026-09-02, 3024×3024 HEIC 한 장:
 *
 *  - Chromium: `<img>` 로는 **못 읽고**, libheif 로 디코드 184ms + JPEG 인코드 30ms.
 *    photoImport 의 축소(2400px)까지 붙여 전 구간 217ms, 결과 572KB JPEG 로 다시 읽힌다.
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
 * 캔버스를 흉내 낸다. jsdom 에는 2D 컨텍스트도 JPEG 인코더도 없다.
 *
 * `toBlob` 이 주는 크기를 **화소 수에 비례**하게 만든다 — 「줄이면 결과도 작아진다」는
 * JPEG 의 성질이 축소 시험의 전부라, 그 관계가 없으면 아무것도 지키지 못한다.
 *
 * 돌려주는 배열에는 구울 때마다 캔버스가 가졌던 화소 수가 쌓인다. 몇 번 구웠는지와
 * 정말 줄여서 구웠는지를 여기서 본다.
 */
function stubCanvasEncoder(bytesPerPixel: number): number[] {
  const bakedPixels: number[] = [];
  const realCreateElement = document.createElement.bind(document);

  jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return realCreateElement(tag);

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (done: (blob: Blob | null) => void) => {
        const pixels = canvas.width * canvas.height;
        bakedPixels.push(pixels);
        done(new Blob([new Uint8Array(Math.round(pixels * bytesPerPixel))]));
      },
    };

    return canvas as unknown as HTMLElement;
  });

  return bakedPixels;
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

    아이폰 24MP 사진은 압축된 원본이 3MB 여도 화소를 그대로 두고 다시 구우면 10MiB 를
    넘긴다. 그러면 `uploadToS3WithPresigned` 가 발급 전에 거절해서, 여기까지 와 놓고
    마지막 단계에서만 실패한다 — 아이폰 사진을 지원한다고 해 놓고 안 되는 자리다.
  */
  it("한도를 넘는 사진은 들어올 때까지 줄여서 굽는다", async () => {
    stubImageDecoding("succeeds", { width: 6000, height: 4000 });
    // 화소당 0.5바이트 — 품질 0.92 JPEG 의 실측 어림값이다. 24MP 면 약 12MB 라 넘긴다.
    const bakedPixels = stubCanvasEncoder(0.5);

    const heic = new File(["x"], "IMG_0001.heic", { type: "image/heic" });
    const converted = await toUploadableFile(heic);

    expect(converted.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(converted.name).toBe("IMG_0001.jpg");
    // 원본 화소로 한 번 굽고, 넘쳐서 더 작게 다시 구웠다.
    expect(bakedPixels).toHaveLength(2);
    expect(bakedPixels[1]).toBeLessThan(bakedPixels[0]);
  });

  /*
    반대쪽도 지킨다. 한도 안에 드는 사진의 화소를 줄이면 프로필·프레임 자산이 이유 없이
    흐려진다 — 여기서 줄이는 기준은 「올릴 수 있는가」 하나뿐이다.
  */
  it("한도 안에 드는 사진은 화소를 안 줄인다", async () => {
    stubImageDecoding("succeeds", { width: 3024, height: 3024 });
    const bakedPixels = stubCanvasEncoder(0.5);

    const heic = new File(["x"], "IMG_0002.heic", { type: "image/heic" });
    await toUploadableFile(heic);

    expect(bakedPixels).toEqual([3024 * 3024]);
  });
});
