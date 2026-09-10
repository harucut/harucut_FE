/**
 * 캔버스 예산의 **못**. 값 자체보다 「어디까지 움직여도 되는가」를 고정한다.
 *
 * 이 파일이 제품 상수를 손으로 베끼지 않는 것이 핵심이다. 베껴 두면 예산을 내려도 시험이
 * 같이 내려가 아무것도 안 잡는다 — 실제로 그런 시험이 있었고(예산을 14,500,000 으로
 * 내려도 전부 통과했다) 그래서 여기로 옮겼다. 움직이지 않는 기준은 둘뿐이다.
 *
 *  1. **기기 쪽 선** — 2^24. 제품 상수가 아니라 밖에서 온 숫자다.
 *  2. **우리 레이아웃** — `FRAME_LAYOUTS` 에서 직접 읽는다. 손으로 적지 않는다.
 */
import {
  fitCanvasScale,
  MAX_CANVAS_EDGE,
  MAX_CANVAS_PIXELS,
  MAX_TILE_PIXELS,
} from "@/lib/canvas/canvasBudget";
import { FRAME_LAYOUTS } from "@/constants/frameLayouts";

/**
 * iOS Safari 가 그 위로는 조용히 포기한다고 **전해지는** 넓이. 2^24 px 다.
 *
 * 실기기로 확인한 적이 없다(`canvasBudget.ts` 「가정」). 그래도 이 시험의 기준으로 쓰는
 * 이유는 제품 상수와 달리 **우리가 못 움직이는 숫자**라서다.
 */
const IOS_CANVAS_PIXEL_LIMIT = 16_777_216;

/** 우리가 실제로 그려서 내보내는 가장 긴 변. 레이아웃에서 직접 읽는다. */
const LAYOUT_LONGEST_EDGE = Math.max(
  ...Object.values(FRAME_LAYOUTS).flatMap((layout) => [
    layout.totalWidth,
    layout.totalHeight,
  ]),
);

describe("캔버스 예산", () => {
  it("넓이 예산은 기기 쪽 선을 넘지 않는다", () => {
    expect(MAX_CANVAS_PIXELS).toBeLessThanOrEqual(IOS_CANVAS_PIXEL_LIMIT);
  });

  /*
    반대쪽 못. 이게 없으면 예산을 얼마로 내리든 시험이 전부 통과한다 — 「넘지 않는다」만
    보는 시험은 0 으로 내려도 만족하기 때문이다. 예산을 깎는 것은 공짜가 아니라 결과물
    해상도를 그만큼 잃는 일이라, 기기 선의 90% 밑으로 내리려면 이 줄을 같이 옮기면서
    **왜 내리는지**를 적게 한다.
  */
  it("근거 없이 예산을 더 깎지 않는다 — 기기 선의 90% 위에 둔다", () => {
    expect(MAX_CANVAS_PIXELS).toBeGreaterThan(IOS_CANVAS_PIXEL_LIMIT * 0.9);
  });

  /*
    변 상한은 기기에서 잰 값이 아니라 **우리 레이아웃의 긴 변**이다(`canvasBudget.ts`).
    그래서 못도 레이아웃에 건다 — 손으로 적은 6000 이 아니라 FRAME_LAYOUTS 에서 읽는다.
    더 큰 레이아웃이 생기면 여기서 깨지고, 그때 둘 중 하나를 정해야 한다: 상한을 올리든가
    그 레이아웃이 줄어드는 것을 받아들이든가.
  */
  it("변 상한이 우리 레이아웃을 깎지 않는다", () => {
    expect(MAX_CANVAS_EDGE).toBeGreaterThanOrEqual(LAYOUT_LONGEST_EDGE);
  });

  it("우리가 그려 본 적 없는 크기까지 열어 주지는 않는다", () => {
    expect(MAX_CANVAS_EDGE).toBeLessThanOrEqual(LAYOUT_LONGEST_EDGE);
  });
});

/**
 * 타일 예산의 못. 이 값은 기기에서 온 것이 아니라 **우리가 정한 작업 크기**라, 기준도
 * 바깥 숫자가 아니라 **캔버스 예산과의 관계**로 잡는다. 양쪽을 다 걸어야 한다 —
 * 한쪽만 있으면 「타일을 안 나누는 것」이나 「화소 하나짜리 타일」이 그대로 통과한다.
 */
describe("타일 예산", () => {
  /*
    타일도 캔버스다. 이 값이 목적지 캔버스만큼 크면 나눠 그리는 뜻이 없다 — 지적이
    말한 최대 메모리가 그대로 남는다. 1/4 은 「눈에 띄게 작다」의 선으로 고른 값이고,
    지금 값(100만)은 예산의 1/16 이라 한참 아래다.
  */
  it("타일 하나가 목적지 캔버스만 해지지 않는다", () => {
    expect(MAX_TILE_PIXELS).toBeLessThanOrEqual(MAX_CANVAS_PIXELS / 4);
  });

  /*
    타일은 원본 좌표계에서 대체로 정사각형이다(`fitCanvasScale` 이 가로세로 같은 배율을
    주므로). 그 한 변이 변 상한을 넘으면 타일 자체가 조용히 비는데, 그건 이 수정이 막으려던
    바로 그 사고다.
  */
  it("타일 한 변이 변 상한을 넘지 않는다", () => {
    expect(Math.ceil(Math.sqrt(MAX_TILE_PIXELS))).toBeLessThanOrEqual(
      MAX_CANVAS_EDGE,
    );
  });
});

describe("fitCanvasScale", () => {
  it("예산 안이면 손대지 않는다", () => {
    // 클래식 2000×6000 = 12MP, 긴 변 6000 — 둘 다 예산 안이다. 이게 1이 아니게 되는
    // 순간 비회원의 네컷 결과물이 이유 없이 작아진다.
    const classic = FRAME_LAYOUTS["classic-4"];
    expect(fitCanvasScale(classic.totalWidth, classic.totalHeight)).toBe(1);
  });

  it("넓이를 넘으면 비율을 지킨 채 예산 안으로 줄인다", () => {
    const scale = fitCanvasScale(6000, 4000);
    expect(scale).toBeLessThan(1);

    const width = Math.floor(6000 * scale);
    const height = Math.floor(4000 * scale);
    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    // 비율(1.5)이 유지돼야 사진이 늘어나지 않는다.
    expect(width / height).toBeCloseTo(1.5, 2);
  });

  /*
    ── 넓이만 재면 새는 것 ──

    파노라마 25344×2048 은 51.9MP 라 넓이 예산에는 걸리는데, 넓이만 맞추면 14,000px 이
    넘는 한 변짜리 캔버스가 남는다. 우리가 한 번도 그려 본 적 없는 모양이다.
    (근거로 삼은 2^24 이 4096² 이기도 하다는 것이 이 구멍의 출처다 — canvasBudget.ts 참고.)
  */
  it("넓이가 남아도 한 변이 길면 줄인다", () => {
    const scale = fitCanvasScale(25344, 2048);

    const width = Math.floor(25344 * scale);
    const height = Math.floor(2048 * scale);
    expect(width).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    /*
      비율은 **상대 오차**로 본다. 짧은 변이 세 자리까지 내려가면 내림 한 번이 비율을
      0.02 씩 흔들어서, 절대값으로 죄면 그 자리에서만 깨진다. 여기서 잡고 싶은 것은
      「한 변에만 배율을 걸어 그림이 늘어나는」 수정이라 1% 면 충분하다.
    */
    const ratio = width / height;
    const sourceRatio = 25344 / 2048;
    expect(Math.abs(ratio - sourceRatio) / sourceRatio).toBeLessThan(0.01);
  });

  it("두 규칙 중 더 많이 줄이는 쪽을 쓴다", () => {
    // 아이폰 48MP(8064×6048). 여기서는 넓이가 먼저 걸린다 — 넓이에 맞추고 나면 긴 변도
    // 자동으로 상한 아래다.
    const scale = fitCanvasScale(8064, 6048);
    const width = Math.floor(8064 * scale);
    const height = Math.floor(6048 * scale);

    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_CANVAS_EDGE);
    // 필요 이상으로 깎지도 않는다. 걸린 규칙 하나에 딱 맞춘 배율이어야 한다.
    expect(width * height).toBeGreaterThan(MAX_CANVAS_PIXELS * 0.99);
  });
});
