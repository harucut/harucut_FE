import {
  composeFrameImage,
  downloadBlob,
  downloadFromUrl,
} from "@/lib/canvas/composeFrame";
import {
  getNativeSaveErrorMessage,
  type BridgeFailureCode,
} from "@/lib/nativeBridge";
import type { ThemeExportJson } from "@/lib/types/themeEditor";

// jsdom 에는 2D 컨텍스트가 없다. 그리기 호출을 세는 가짜 캔버스를 끼워, "무엇을 그렸나"가
// 아니라 **무엇을 안 그렸나**를 고정한다.
jest.mock("@/lib/canvas/loaders", () => ({
  loadImage: jest.fn(async (src: string) => ({
    src,
    naturalWidth: 100,
    naturalHeight: 100,
  })),
}));

// jsdom 에는 잴 캔버스가 없다. `ctx.filter` 지원 여부는 시험이 정하고, 굽는 함수는 진짜를 쓴다.
let mockCanvasFilterSupported = true;
jest.mock("@/lib/frameFilters", () => ({
  ...jest.requireActual("@/lib/frameFilters"),
  canvasFilterSupported: () => mockCanvasFilterSupported,
}));

type PaintLog = {
  /** fillStyle·strokeStyle 에 대입된 값 전부. 초록 링이 살아 있으면 여기 남는다. */
  styles: unknown[];
  radialGradients: number;
  strokes: number;
  drawImages: number;
  /** `ctx.filter` 에 대입된 값 전부. */
  filters: string[];
  /** 그린 그림(`draw:<src>`)과 픽셀 굽기(`bake:x,y,w,h`)가 일어난 순서. */
  ops: string[];
};

function stubCanvas(): PaintLog {
  const log: PaintLog = {
    styles: [],
    radialGradients: 0,
    strokes: 0,
    drawImages: 0,
    filters: [],
    ops: [],
  };
  let filter = "none";
  let scale = 1;

  const ctx = {
    get filter() {
      return filter;
    },
    set filter(value: string) {
      log.filters.push(value);
      filter = value;
    },
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
    scale(by: number) {
      scale *= by;
    },
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }),
    fill() {},
    fillRect() {},
    stroke() {
      log.strokes += 1;
    },
    drawImage(image: { src?: string }) {
      log.drawImages += 1;
      log.ops.push(`draw:${image.src}`);
    },
    getImageData(x: number, y: number, w: number, h: number) {
      log.ops.push(`bake:${x},${y},${w},${h}`);
      return { data: Uint8ClampedArray.of(255, 0, 0, 255) };
    },
    putImageData() {},
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
      composeFrameImage({
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

    await composeFrameImage({
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
    await composeFrameImage({
      layout,
      borderColor: "#000000",
      sources,
      theme: { ...base, cellCutouts: [false, false, false, false] },
    });
    const off = { ...offLog };
    jest.restoreAllMocks();

    const onLog = stubCanvas();
    await composeFrameImage({
      layout,
      borderColor: "#000000",
      sources,
      theme: { ...base, cellCutouts: [true, true, true, true] },
    });

    expect(onLog).toEqual(off);
  });
});

/*
  비회원 저장본은 브라우저가 그린 이 그림이 전부다. 아이폰(WebKit)은 `ctx.filter` 를 받기만
  하고 무시해서, 미리보기(CSS)에 보이던 흑백·밝게·뽀샤시가 저장본에서만 빠졌다.
*/
describe("composeFrame 필터 — ctx.filter 를 무시하는 브라우저", () => {
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
  const sources = [
    { src: "/a.png" },
    { src: "/b.png" },
    { src: "/c.png" },
    { src: "/d.png" },
  ];
  const bakes = (log: PaintLog) => log.ops.filter((op) => op.startsWith("bake:"));

  afterEach(() => {
    mockCanvasFilterSupported = true;
  });

  it("사진을 그린 칸마다 픽셀에 굽고, 스티커는 그 뒤에 얹어 물들지 않는다", async () => {
    mockCanvasFilterSupported = false;
    const log = stubCanvas();

    await composeFrameImage({
      layout,
      borderColor: "#000000",
      sources,
      outputFilter: "B&W",
      theme: {
        frameId: "grid-4",
        background: { type: "COLOR", value: "#000000" },
        components: [
          {
            id: "heart",
            type: "STICKER",
            source: "/stickers/heart.png",
            x: 40,
            y: 40,
            width: 20,
            height: 20,
            scale: 1,
            rotation: 0,
            zIndex: 1,
          },
        ],
      },
    });

    expect(log.ops).toEqual([
      "draw:/a.png",
      "bake:0,0,50,50",
      "draw:/b.png",
      "bake:50,0,50,50",
      "draw:/c.png",
      "bake:0,50,50,50",
      "draw:/d.png",
      "bake:50,50,50,50",
      "draw:/stickers/heart.png",
    ]);
    // 무시될 값을 걸어 두지 않는다 — 언젠가 반쯤 먹으면 두 번 입혀진다.
    expect(log.filters).not.toContain("grayscale(1)");
  });

  it("ctx.filter 가 먹는 브라우저(크롬)는 예전처럼 ctx.filter 로 그리고 픽셀을 읽지 않는다", async () => {
    const log = stubCanvas();

    await composeFrameImage({ layout, borderColor: "#000000", sources, outputFilter: "B&W" });

    expect(log.filters).toEqual(Array(4).fill("grayscale(1)"));
    expect(bakes(log)).toEqual([]);
  });

  // 변이 6000 을 넘는 레이아웃은 ctx.scale(0.5)로 줄여 그린다(canvasBudget). 레이아웃 좌표를
  // 그대로 읽으면 엉뚱한 칸을 굽고, 캔버스를 통째로 읽으면 칸마다 16MP 를 훑는다.
  it("예산 배율이 걸려도 장치 픽셀로 옮긴 그 칸만 읽는다", async () => {
    mockCanvasFilterSupported = false;
    const log = stubCanvas();

    await composeFrameImage({
      layout: {
        totalWidth: 12000,
        totalHeight: 100,
        slots: [0, 1, 2, 3].map((index) => ({
          x: index * 3000,
          y: 0,
          width: 3000,
          height: 100,
        })),
      },
      borderColor: "#000000",
      sources,
      outputFilter: "SOFT",
    });

    expect(bakes(log)).toEqual([
      "bake:0,0,1500,50",
      "bake:1500,0,1500,50",
      "bake:3000,0,1500,50",
      "bake:4500,0,1500,50",
    ]);
  });
});

/*
  앱 셸 안에서 사진첩 저장이 실패했을 때.

  여기서 던지는 모양이 화면 문구를 정한다. 일반 `Error` 로 바꾸면
  getUserFacingApiErrorMessage() 가 message 를 **일부러** 버려서(lib/apiError.ts 의
  getServerMessage), 재시도로는 절대 풀리지 않는 권한 거절에도 `잠시 후 다시 시도해 주세요.`
  만 뜬다 — 사용자가 설정을 열어야 한다는 사실이 통째로 사라진다.

  네이티브 브리지는 목하지 않는다. 목은 셸(ReactNativeWebView)뿐이라 프로토콜이 실제로 돈다.
*/
describe("셸 안에서 저장이 실패하면", () => {
  /** 저장 요청에 정해진 답을 돌려주는 가짜 셸. */
  function installShell(result: {
    ok: boolean;
    reason?: string;
    code?: BridgeFailureCode;
  }) {
    window.__HARUCUT_NATIVE__ = { version: 1, platform: "android" };
    window.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const message = JSON.parse(raw) as { type: string; id?: string };
        if (message.type !== "save-url" && message.type !== "save-end") return;
        queueMicrotask(() => window.__harucutNativeResolve__?.(message.id!, result));
      },
    };
  }

  afterEach(() => {
    delete window.__HARUCUT_NATIVE__;
    delete window.ReactNativeWebView;
    delete window.__harucutNativeResolve__;
  });

  it("권한 거절은 네이티브가 쓴 안내를 그대로 실어 던진다", async () => {
    installShell({
      ok: false,
      reason: "설정에서 사진 접근을 허용해 주세요.",
      code: "photo-permission-blocked",
    });

    const error = await downloadFromUrl("https://x/y.png", "cut.png").then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(getNativeSaveErrorMessage(error)).toBe("설정에서 사진 접근을 허용해 주세요.");
  });

  it("비회원 blob 저장도 같은 모양으로 던진다", async () => {
    installShell({
      ok: false,
      reason: "사진첩 저장 권한이 필요해요.",
      code: "photo-permission-denied",
    });

    const error = await downloadBlob(
      new Blob([new Uint8Array(8)], { type: "image/png" }),
      "cut.png",
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(getNativeSaveErrorMessage(error)).toBe("사진첩 저장 권한이 필요해요.");
  });

  it("code 없는 실패는 사유를 화면으로 넘기지 않는다 — 폴백이 맞다", async () => {
    installShell({ ok: false, reason: "MediaLibrary is not available on this device" });

    const error = await downloadFromUrl("https://x/y.png", "cut.png").then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(Error);
    expect(getNativeSaveErrorMessage(error)).toBeNull();
  });
});

// `fitCanvasScale` 시험은 소유자를 따라 `canvasBudget.test.ts` 로 옮겼다. 예산은 이제
// 합성만의 것이 아니라 `imageDecode` 도 쓰는 공용 잎(`lib/canvas/canvasBudget.ts`)이다.

test("JPEG 품질을 인코더에 넘기고 원본 배열과 무관하게 zIndex 순서대로 그린다", async () => {
  const log = stubCanvas();
  const component = { type: "STICKER" as const, x: 0, y: 0, width: 10, height: 10, scale: 1, rotation: 0, styleJson: {} };
  const theme: ThemeExportJson = { frameId: "classic-4", components: [
    { ...component, id: "top", source: "/top.png", zIndex: 9 },
    { ...component, id: "bottom", source: "/bottom.png", zIndex: 1 },
  ] };
  await composeFrameImage({
    layout: { totalWidth: 100, totalHeight: 100, slots: [{ x: 0, y: 0, width: 100, height: 100 }] },
    borderColor: "#ffffff", sources: [{ src: "/photo.jpg" }], theme, mimeType: "image/jpeg", quality: 0.92,
  });
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
  expect(log.ops.filter((op) => op.startsWith("draw:"))).toEqual(["draw:/photo.jpg", "draw:/bottom.png", "draw:/top.png"]);
  expect(theme.components[0].id).toBe("top");
});
