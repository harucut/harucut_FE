import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import {
  PREVIEW_MAX_EDGE,
  renderThemePreviewPng,
} from "@/lib/canvas/renderThemePreview";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// jsdom 에는 2D 컨텍스트가 없다. 좌표를 받아 적는 가짜 캔버스를 끼워, **어떤 좌표계로**
// 그렸는지를 고정한다.
jest.mock("@/lib/canvas/loaders", () => ({
  loadImage: jest.fn(async () => ({ naturalWidth: 1000, naturalHeight: 1000 })),
}));

type PaintLog = {
  /** ctx.scale(x, y) 로 들어온 값. 첫 번째가 캔버스 축소 배율이다. */
  scales: Array<[number, number]>;
  /**
   * arcTo(x1, y1, x2, y2, r) 인자.
   * drawRoundedRect 는 오른쪽 위 모서리부터 도니 첫 호출이 사각형의 오른쪽·아래 끝이다.
   */
  arcs: Array<[number, number, number, number, number]>;
  /** drawImage(img, dx, dy, dw, dh) 인자. 배경 cover 계산의 결과가 여기 남는다. */
  drawImages: Array<[number, number, number, number]>;
};

function stubCanvas(): PaintLog {
  const log: PaintLog = { scales: [], arcs: [], drawImages: [] };

  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: "",
    strokeStyle: "",
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
      log.arcs.push([x1, y1, x2, y2, r]);
    },
    clip() {},
    translate() {},
    rotate() {},
    scale(x: number, y: number) {
      log.scales.push([x, y]);
    },
    fill() {},
    stroke() {},
    drawImage(_img: unknown, dx: number, dy: number, dw: number, dh: number) {
      log.drawImages.push([dx, dy, dw, dh]);
    },
  };

  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(
      (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

  jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    });

  return log;
}

afterEach(() => {
  jest.restoreAllMocks();
});

/*
  프리뷰는 목록 썸네일인데 예전엔 프레임 원본 해상도(최대 4000x6000, 24MP)로 구웠다.
  무손실 PNG 라 배경 사진이 깔리면 업로드 상한 10MB 를 넘겨 presign 요청이 나가지도
  못했고, 프레임 저장이 통째로 실패했다. 프레임이 더 커져도 재발하지 않게 여기서 막는다.
*/
describe("renderThemePreviewPng 의 캔버스 크기", () => {
  const frameIds = Object.keys(FRAME_LAYOUTS) as Array<
    keyof typeof FRAME_LAYOUTS
  >;

  it.each(frameIds)("%s 는 긴 변이 상한 이하다", async (frameId) => {
    stubCanvas();
    const spy = jest.spyOn(document, "createElement");

    await renderThemePreviewPng({
      frameId,
      background: { type: "COLOR", value: "#101010" },
      components: [],
    });

    const canvas = spy.mock.results
      .map((r) => r.value as HTMLElement)
      .find((el): el is HTMLCanvasElement => el instanceof HTMLCanvasElement);

    const layout = FRAME_LAYOUTS[frameId];
    expect(canvas).toBeDefined();
    expect(Math.max(canvas!.width, canvas!.height)).toBeLessThanOrEqual(
      PREVIEW_MAX_EDGE,
    );
    // 비율은 그대로여야 한다 — 썸네일이 찌그러지면 목록에서 바로 보인다.
    expect(canvas!.width / canvas!.height).toBeCloseTo(
      layout.totalWidth / layout.totalHeight,
      2,
    );
  });
});

/*
  축소는 ctx.scale 로 한다. 그래서 그리기 좌표는 **프레임 원본** 좌표여야 한다.
  canvas.width/height 를 좌표로 쓰면(축소 전 코드가 그랬다) 그림이 프레임의 일부만
  덮은 채 남는다 — 크기는 줄었는데 그림이 틀어지는, 눈으로 놓치기 쉬운 회귀다.
*/
describe("축소해도 그림은 프레임 전체를 덮는다", () => {
  it("정사각 배경 사진을 세로 프레임에 cover 로 깐다", async () => {
    const log = stubCanvas();
    const layout = FRAME_LAYOUTS["grid-4"];
    const theme: ThemeExportJson = {
      frameId: "grid-4",
      background: { type: "IMAGE", url: "/bg.png", opacity: 1 },
      components: [],
    };

    await renderThemePreviewPng(theme);

    const scale = PREVIEW_MAX_EDGE / layout.totalHeight;
    expect(log.scales[0]).toEqual([scale, scale]);

    // 1:1 사진을 4000x6000 에 cover 로 깔면 높이에 맞춰 6000x6000 이 되고 좌우가 잘린다.
    const [dx, dy, dw, dh] = log.drawImages[0];
    expect(dw).toBeCloseTo(layout.totalHeight, 5);
    expect(dh).toBeCloseTo(layout.totalHeight, 5);
    expect(dx).toBeCloseTo((layout.totalWidth - layout.totalHeight) / 2, 5);
    expect(dy).toBeCloseTo(0, 5);
  });

  it("배경 판도 프레임 원본 좌표로 칠한다", async () => {
    const log = stubCanvas();
    const layout = FRAME_LAYOUTS["wide-4"];

    await renderThemePreviewPng({
      frameId: "wide-4",
      background: { type: "COLOR", value: "#101010" },
      components: [],
    });

    // 맨 처음 그리는 것이 배경 판(둥근 사각형)이다. 오른쪽·아래 끝이 프레임 끝이어야 한다.
    expect(log.arcs[0]).toEqual([
      layout.totalWidth,
      0,
      layout.totalWidth,
      layout.totalHeight,
      60,
    ]);
  });
});
