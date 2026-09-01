import { composeFramePng, fitCanvasScale } from "@/lib/canvas/composeFrame";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// jsdom 에는 2D 컨텍스트가 없다. 그리기 호출을 세는 가짜 캔버스를 끼워, "무엇을 그렸나"가
// 아니라 **무엇을 안 그렸나**를 고정한다.
jest.mock("@/lib/canvas/loaders", () => ({
  loadImage: jest.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
}));

type PaintLog = {
  /** fillStyle·strokeStyle 에 대입된 값 전부. 초록 링이 살아 있으면 여기 남는다. */
  styles: unknown[];
  radialGradients: number;
  strokes: number;
  drawImages: number;
};

function stubCanvas(): PaintLog {
  const log: PaintLog = {
    styles: [],
    radialGradients: 0,
    strokes: 0,
    drawImages: 0,
  };

  const ctx = {
    filter: "none",
    globalAlpha: 1,
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    arcTo() {},
    rect() {},
    clip() {},
    translate() {},
    rotate() {},
    scale() {},
    fill() {},
    fillRect() {},
    stroke() {
      log.strokes += 1;
    },
    drawImage() {
      log.drawImages += 1;
    },
    createRadialGradient() {
      log.radialGradients += 1;
      return { addColorStop() {} };
    },
    set fillStyle(value: unknown) {
      log.styles.push(value);
    },
    set strokeStyle(value: unknown) {
      log.styles.push(value);
    },
  };

  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(
      (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

  jest
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (callback: BlobCallback) {
      callback(new Blob(["png"], { type: "image/png" }));
    });

  return log;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("composeFrame validations", () => {
  const layout = {
    totalWidth: 100,
    totalHeight: 100,
    slots: [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ],
  };

  // 슬롯 개수와 소스 개수가 다르면 합성을 시작하면 안 됩니다.
  it("throws when PNG sources length does not match slot count", async () => {
    await expect(
      composeFramePng({
        layout,
        borderColor: "#000",
        sources: [{ src: "/a.png" }],
      }),
    ).rejects.toThrow("sources length must match slot count");
  });

  // 예전에는 켜진 칸에 방사형 비네트 + 초록 링(#1ED760)을 구웠다. 배경 제거가 아니라
  // 이름만 누끼인 효과라 걷어냈다 — 실제 누끼는 촬영 사진 픽셀에 미리 구워진다
  // (lib/canvas/personCutout.ts). 되살아나면 결과물에 그대로 박히므로 여기서 막는다.
  it("cellCutouts 가 전부 켜져도 비네트·초록 링을 그리지 않는다", async () => {
    const log = stubCanvas();
    const theme: ThemeExportJson = {
      frameId: "grid-4",
      background: { type: "COLOR", value: "#000000" },
      cellCutouts: [true, true, true, true],
      components: [],
    };

    await composeFramePng({
      layout,
      borderColor: "#000000",
      sources: [
        { src: "/a.png" },
        { src: "/b.png" },
        { src: "/c.png" },
        { src: "/d.png" },
      ],
      theme,
    });

    // 사진 4장은 그대로 깔린다 — 지운 것은 그리기 자체가 아니라 가짜 효과다.
    expect(log.drawImages).toBe(4);
    expect(log.radialGradients).toBe(0);
    expect(log.strokes).toBe(0);
    expect(log.styles).not.toContain("#1ED760");
  });

  // cellCutouts 는 남는다: 그리지 않을 뿐, 데이터 경로를 막지 않는다.
  it("cellCutouts 유무와 무관하게 합성은 같은 결과를 낸다", async () => {
    const sources = [
      { src: "/a.png" },
      { src: "/b.png" },
      { src: "/c.png" },
      { src: "/d.png" },
    ];
    const base: ThemeExportJson = {
      frameId: "grid-4",
      background: { type: "COLOR", value: "#000000" },
      components: [],
    };

    const offLog = stubCanvas();
    await composeFramePng({
      layout,
      borderColor: "#000000",
      sources,
      theme: { ...base, cellCutouts: [false, false, false, false] },
    });
    const off = { ...offLog };
    jest.restoreAllMocks();

    const onLog = stubCanvas();
    await composeFramePng({
      layout,
      borderColor: "#000000",
      sources,
      theme: { ...base, cellCutouts: [true, true, true, true] },
    });

    expect(onLog).toEqual(off);
  });
});

// iOS Safari 는 캔버스 넓이가 2^24px 를 넘으면 조용히 빈 캔버스를 돌려준다.
// 가로 4컷(6000×4000)·세로형(4000×6000)이 24MP 라 그 선을 넘는다.
describe("fitCanvasScale", () => {
  it("leaves canvases within the budget untouched", () => {
    // 세로 4컷 2000×6000 = 12MP — 상한 안이다.
    expect(fitCanvasScale(2000, 6000)).toBe(1);
  });

  it("shrinks oversized canvases below the budget while keeping the ratio", () => {
    const scale = fitCanvasScale(6000, 4000);
    expect(scale).toBeLessThan(1);

    const width = Math.floor(6000 * scale);
    const height = Math.floor(4000 * scale);
    expect(width * height).toBeLessThanOrEqual(16_000_000);
    // 비율(1.5)이 유지돼야 사진이 늘어나지 않는다.
    expect(width / height).toBeCloseTo(1.5, 2);
  });
});
