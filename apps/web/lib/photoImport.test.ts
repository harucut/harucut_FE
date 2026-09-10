/**
 * 갤러리에서 불러온 사진이 **어느 슬롯에서도 도로 확대되지 않을 만큼** 크게 남는지 지킨다.
 *
 * 불러온 사진은 `importPhotoFiles` 에서 한 번 줄인 뒤 합성 단계
 * (`lib/fourcutCompose.ts` `renderSourceForSlot`)에서 슬롯 크기 캔버스에 `drawCover` 로
 * 그려진다. `lib/canvas/draw.ts` 의 배율에는 1 상한이 없어서, 여기서 슬롯보다 작게 깎으면
 * 원본에 있던 화소를 버린 채 확대한 그림만 남는다. 실제로 상한이 2000px 이던 시절
 * wide-4(2400×1700)·grid-4·polaroid-4(1700×2400)에서 1.2배 확대가 났다.
 *
 * **긴 변만 재는 것으로는 부족했다.** 상한이 「긴 변 2400」이던 시절, 슬롯과 **방향이 다른**
 * 사진에서는 짧은 변이 먼저 말라붙었다 — 16:9 가로 사진이 2400×1350 이 되어 세로 슬롯
 * (1700×2400)에서 1.78배, 가로 슬롯인 wide-4(2400×1700)에서도 1.26배 확대됐다. 그래서
 * 아래 단언은 **두 변을 다** 재고, 같이 지키는 것이 메모리 쪽 상한(한 장의 화소 수)이다.
 */
import { MAX_CANVAS_EDGE } from "@/lib/canvas/canvasBudget";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { importPhotoFiles } from "@/lib/photoImport";

const ALL_SLOTS = Object.values(FRAME_LAYOUTS).flatMap((layout) => layout.slots);

/** 모든 프레임의 슬롯 중 가장 긴 변. 지금은 2400px(wide-4 가로, grid-4·polaroid-4 세로). */
const LONGEST_SLOT_EDGE = Math.max(
  ...ALL_SLOTS.map((slot) => Math.max(slot.width, slot.height)),
);

/**
 * 한 장이 들 수 있는 화소 수 — 제품 코드의 `MAX_PIXELS` 와 **같은 유도**다.
 *
 * 「가장 넓은 슬롯의 가로 × 가장 긴 슬롯의 세로」, 곧 모든 슬롯을 한 번에 덮는 가장 작은
 * 직사각형이다. 두 값 모두 슬롯의 한 변이라 **어떤 레이아웃에서도** 가장 긴 변의 제곱
 * (예전 규칙이 정사각형 원본에서 만들던 최대 화소) 이하다 — 그래서 이 상한은 메모리
 * 방어를 넓히지 않는다.
 */
const PIXEL_BUDGET =
  Math.max(...ALL_SLOTS.map((slot) => slot.width)) *
  Math.max(...ALL_SLOTS.map((slot) => slot.height));

/** 예전 규칙(긴 변만 상한). 「새 규칙이 예전보다 작게 깎지 않는다」를 재는 데 쓴다. */
function legacySize(width: number, height: number) {
  const scale = Math.min(1, LONGEST_SLOT_EDGE / Math.max(width, height));
  return Math.round(width * scale) * Math.round(height * scale);
}

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
 * **열어 봐야 아는** 실패 한 장. MIME 은 이미지라 사전 필터를 통과하지만, 크기를 등록하지
 * 않아 디코딩에서 실패한다 — 깨진 사진이나 우리가 못 푸는 형식이 이 모양이다.
 *
 * (예전에는 `image/heic` 이면 사전 필터에서 잘렸다. 지금은 HEIC 를 JPEG 로 바꿔 주므로
 * 「형식」만으로는 못 자르고, 열어 봐야 안다.)
 */
function undecodableFile(name: string) {
  return new File(["stub"], name, { type: "image/heic" });
}

/** 열어 볼 것도 없이 걸러지는 파일. 사진이 아니다. */
function nonImageFile(name: string) {
  return new File(["stub"], name, { type: "video/mp4" });
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

    /*
      4:3 을 유지한 채 **넓이**를 예산(2400×2400)까지 줄인다 — 긴 변을 2400 으로 자르던
      시절의 2400×1800(4.32MP)이 아니다. 반올림 오차만큼 예산에 못 미친다.
    */
    expect(baked).toEqual([{ width: 2771, height: 2078 }]);
    expect(2771 / 2078).toBeCloseTo(4 / 3, 2);
  });
});

/**
 * **방향이 다른 슬롯**에서 짧은 변이 말라붙지 않는지.
 *
 * 재현(2026-09-10, 아래 수치는 이 스텁으로 잰 것이다): 긴 변만 2400 으로 자르면 16:9 가로
 * 사진이 2400×1350 이 되고, 합성이 이를 세로 슬롯 1700×2400 에 `cover` 로 넣으며 **1.78배**
 * 확대했다. 가로 슬롯인 wide-4(2400×1700)에서도 1.26배 확대됐다 — 사진이 슬롯보다 납작해서다.
 *
 * 지금은 넓이로 상한을 걸어 같은 예산을 **짧은 변 쪽에** 쓴다. 비율을 그대로 두므로(자르지
 * 않는다 — `lib/photoImport.ts` 파일 주석) 확대율이 r 에서 √r 로 떨어진다.
 * 세로 슬롯 × 가로 사진의 확대는 **완전히 없어지지 않는다.** 그 한계는 제품 코드
 * `MAX_PIXELS` 주석에 이유·숫자와 함께 적혀 있고, 여기서는 √r 선을 못 박는다.
 */
describe("importPhotoFiles 방향이 다른 슬롯", () => {
  /** 16:9 가로. 폰 카메라가 흔히 내놓는 가장 납작한 비율이다. */
  const WIDE_SOURCE = { width: 4608, height: 2592 };
  const WIDE_RATIO = WIDE_SOURCE.width / WIDE_SOURCE.height;

  it("가로 16:9 원본이 가로 슬롯에서 더는 확대되지 않는다", async () => {
    await importPhotoFiles([photoFile("wide.jpg", WIDE_SOURCE.width, WIDE_SOURCE.height)]);

    const [{ width, height }] = baked;
    // 예전 규칙의 2400×1350 은 wide-4 에서 1.26배였다.
    for (const frameId of ["wide-4", "classic-4"] as const) {
      for (const slot of FRAME_LAYOUTS[frameId].slots) {
        expect(coverScale(slot, width, height)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("가로 16:9 원본의 세로 슬롯 확대가 비율에서 그 제곱근까지 준다", async () => {
    await importPhotoFiles([photoFile("wide.jpg", WIDE_SOURCE.width, WIDE_SOURCE.height)]);

    const [{ width, height }] = baked;
    for (const frameId of ["grid-4", "polaroid-4"] as const) {
      for (const slot of FRAME_LAYOUTS[frameId].slots) {
        const scale = coverScale(slot, width, height);
        // 예전에는 r(=1.78)배였다. 지금은 √r(=1.33)배 — 반올림 여유 0.1%.
        expect(scale).toBeLessThanOrEqual(Math.sqrt(WIDE_RATIO) * 1.001);
        // 그래도 남는 확대가 있다. 「없다」고 적지 않으려고 같이 못 박는다.
        expect(scale).toBeGreaterThan(1);
      }
    }
  });

  it("세로 9:16 원본도 같은 규칙을 반대 방향으로 받는다", async () => {
    await importPhotoFiles([photoFile("tall.jpg", WIDE_SOURCE.height, WIDE_SOURCE.width)]);

    const [{ width, height }] = baked;
    // 세로 사진 × 세로 슬롯: 확대 없음.
    for (const frameId of ["grid-4", "polaroid-4"] as const) {
      for (const slot of FRAME_LAYOUTS[frameId].slots) {
        expect(coverScale(slot, width, height)).toBeLessThanOrEqual(1);
      }
    }
    // 세로 사진 × 가로 슬롯: √r 까지만.
    for (const slot of FRAME_LAYOUTS["wide-4"].slots) {
      expect(coverScale(slot, width, height)).toBeLessThanOrEqual(
        Math.sqrt(WIDE_RATIO) * 1.001,
      );
    }
  });
});

/**
 * 반대쪽 못 — **메모리 방어**.
 *
 * 화질만 보고 상한을 걷으면(또는 「짧은 변을 2400 으로 붙든다」로 바꾸면) 16:9 한 장이
 * 10.2MP 가 된다. 이 화면은 한 번에 칸 수 × 6 = 24장까지 담으므로(`PHOTOS_PER_SLOT`)
 * 그 차이가 그대로 세션·DOM 에 쌓인다. 아래 셋이 그 선을 지킨다.
 */
describe("importPhotoFiles 화소 예산", () => {
  const SOURCES: [string, number, number][] = [
    ["16:9", 4608, 2592],
    ["4:3", 4032, 3024],
    ["3:2", 6000, 4000],
    ["1:1", 3024, 3024],
    ["9:16", 2592, 4608],
    ["파노라마", 25344, 2048],
  ];

  it("어떤 비율이든 한 장의 화소가 예산을 넘지 않는다", async () => {
    for (const [name, width, height] of SOURCES) {
      await importPhotoFiles([photoFile(`${name}.jpg`, width, height)]);
    }

    expect(baked).toHaveLength(SOURCES.length);
    for (const { width, height } of baked) {
      // 반올림이 예산을 아주 조금 넘길 수 있다(변마다 최대 0.5px).
      expect(width * height).toBeLessThanOrEqual(PIXEL_BUDGET * 1.001);
    }
  });

  it("어떤 비율이든 예전 규칙보다 작게 깎지 않는다", async () => {
    for (const [name, width, height] of SOURCES) {
      await importPhotoFiles([photoFile(`${name}.jpg`, width, height)]);
    }

    baked.forEach((size, index) => {
      const [, width, height] = SOURCES[index];
      expect(size.width * size.height).toBeGreaterThanOrEqual(
        legacySize(width, height),
      );
    });
  });

  /*
    넓이만 재면 파노라마가 예산을 통과하면서 한 변이 1만 px 을 넘는 캔버스를 만든다.
    그 선의 주인은 `lib/canvas/canvasBudget.ts` 하나다 — 여기에 숫자를 다시 박지 않는다.
  */
  it("파노라마도 캔버스 한 변 상한 안에 남는다", async () => {
    await importPhotoFiles([photoFile("pano.jpg", 25344, 2048)]);

    const [{ width, height }] = baked;
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
  });
});

/**
 * 개수 상한은 **성공한 장수**로 센다.
 *
 * 화면(`app/shoot/upload/page.tsx`)이 먼저 자르던 시절, 앨범에서 28장을 골랐는데 앞 24장이
 * 못 쓰는 파일이면 상한이 그 24장만 통과시키고 뒤의 쓸 수 있는 4장을 잘라 버려 결과가
 * 0장이었다. 지금은 자르는 기준이 「앞에서 24장」이 아니라 「성공 24장」이라, 앞에 실패가
 * 몰려 있어도 뒤가 살아남는다.
 */
describe("importPhotoFiles 개수 상한", () => {
  it("못 읽는 파일이 앞에 몰려 있어도 쓸 수 있는 사진이 살아남는다", async () => {
    const limit = 24;
    const files = [
      ...Array.from({ length: limit }, (_, index) =>
        undecodableFile(`broken-${index}.heic`),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        photoFile(`ok-${index}.jpg`, 1200, 900),
      ),
    ];

    const result = await importPhotoFiles(files, { limit });

    // 상한을 성공이 아니라 순서로 걸면 여기가 0장이 된다.
    expect(result.dataUrls).toHaveLength(4);
    expect(result.overLimitCount).toBe(0);
    // 열어 봐야 알았던 실패다 — 형식만으로는 못 걸렀다.
    expect(result.notice).toMatch(/24장은 읽지 못해 제외했어요/);
    expect(baked).toHaveLength(4);
  });

  /*
    반대쪽: 사진이 아닌 것은 **열어 보지도 않고** 거른다. 그래야 문구가
    「지원하지 않는 형식」으로 정확히 뜨고, 디코딩 비용도 안 든다.
  */
  it("사진이 아닌 파일은 열어 보지 않고 형식으로 거른다", async () => {
    const files = [
      nonImageFile("clip.mp4"),
      photoFile("ok.jpg", 1200, 900),
    ];

    const result = await importPhotoFiles(files);

    expect(result.dataUrls).toHaveLength(1);
    expect(result.notice).toMatch(/1장은 지원하지 않는 형식/);
    expect(result.notice).not.toMatch(/읽지 못해/);
    // 디코딩까지 갔다면 여기가 2가 된다.
    expect(baked).toHaveLength(1);
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
