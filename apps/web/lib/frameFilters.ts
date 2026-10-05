import {
  DEFAULT_FOURCUT_FILTER,
  FOURCUT_FILTER_DEFINITIONS,
  type FourcutFilterId,
} from "@harucut/shared";
import type { Rect } from "@/lib/canvas/draw";

export type { FourcutFilterId };
export { DEFAULT_FOURCUT_FILTER };

export type FourcutFilterOption = {
  id: FourcutFilterId;
  label: string;
  description: string;
  cssFilter: string;
  canvasFilter: string;
};

type FilterStep = readonly [
  name: "grayscale" | "brightness" | "contrast" | "saturate" | "blur",
  amount: number,
];

// id/라벨/설명/순서는 공통 패키지에서 오고, 실제 필터 값만 웹 구현이다.
// CSS 문자열(미리보기·`ctx.filter`)과 픽셀 굽기(`applyFilterPixels`)가 둘 다 이 표에서
// 나온다 — 따로 적으면 아이폰 저장본만 조용히 다른 색이 된다.
const FILTER_STEPS: Record<FourcutFilterId, readonly FilterStep[]> = {
  NONE: [],
  "B&W": [["grayscale", 1]],
  BRIGHT: [
    ["brightness", 1.14],
    ["saturate", 1.04],
    ["contrast", 1.02],
  ],
  SOFT: [
    ["brightness", 1.08],
    ["contrast", 0.94],
    ["saturate", 0.92],
    ["blur", 0.45],
  ],
};

function toCssFilter(steps: readonly FilterStep[]) {
  if (steps.length === 0) return "none";
  return steps
    .map(([name, amount]) => `${name}(${amount}${name === "blur" ? "px" : ""})`)
    .join(" ");
}

export const FOURCUT_FILTERS: FourcutFilterOption[] = FOURCUT_FILTER_DEFINITIONS.map(
  (definition) => {
    const value = toCssFilter(FILTER_STEPS[definition.id]);
    return { ...definition, cssFilter: value, canvasFilter: value };
  },
);

export function getFourcutFilterOption(filterId: FourcutFilterId) {
  return FOURCUT_FILTERS.find((filter) => filter.id === filterId) ?? FOURCUT_FILTERS[0];
}

export function getFourcutFilterCssValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).cssFilter;
}

export function getFourcutFilterCanvasValue(filterId: FourcutFilterId) {
  return getFourcutFilterOption(filterId).canvasFilter;
}

let canvasFilterSupport: boolean | undefined;

/**
 * 이 브라우저의 캔버스가 `ctx.filter` 를 실제로 입히는가. 한 번 재고 기억한다.
 *
 * WebKit(사파리·아이폰 WKWebView)에는 이 속성이 없다 — 대입해도 오류 없이 무시돼서,
 * 미리보기(CSS)에 보이던 효과가 저장본에서만 빠진다. 실측(2026-10-05 Playwright):
 * `grayscale(1)` 을 건 빨간 점이 WebKit 26.5 에서 [255,0,0], 크롬 151 에서 [54,54,54].
 * 그래서 속성 유무가 아니라 **결과**로 잰다.
 *
 * 잴 수 없으면(SSR·캔버스 없음·읽기가 막힌 브라우저) 지원한다고 본다. 지금까지 가던
 * 길이라 잃을 것이 없고, 엉뚱하게 읽힌 픽셀을 사진에 덮어쓰는 일도 없다. 그 답은 기억하지
 * 않는다 — 아이폰은 캔버스 메모리가 차면 컨텍스트를 안 주는데, 그 한 번을 기억하면 그
 * 세션 내내 필터가 다시 빠진다.
 */
export function canvasFilterSupported() {
  if (canvasFilterSupport !== undefined) return canvasFilterSupport;
  if (typeof document === "undefined") return true;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;

    ctx.filter = "grayscale(1)";
    ctx.fillStyle = "#f00";
    ctx.fillRect(0, 0, 1, 1);
    const [red, green] = ctx.getImageData(0, 0, 1, 1).data;
    // 무시됐으면 빨강 그대로다. 사생활 보호용 읽기 잡음(몇 단계)에 안 흔들리게 차이로 본다.
    canvasFilterSupport = red - green < 128;
    return canvasFilterSupport;
  } catch {
    return true;
  }
}

// 휘도 계수. 같은 값인데 스펙이 grayscale 과 saturate(feColorMatrix)에 자릿수를 달리 적었다.
const GRAYSCALE_LUMA = [0.2126, 0.7152, 0.0722] as const;
const SATURATE_LUMA = [0.213, 0.715, 0.072] as const;

/**
 * 한 단계의 3×3 행렬(행 우선)과 더할 값. W3C filter-effects 정의 그대로, 값은 0..255 기준.
 * https://drafts.fxtf.org/filter-effects/#ShorthandEquivalents
 */
function colorMatrix(name: Exclude<FilterStep[0], "blur">, amount: number) {
  if (name === "brightness" || name === "contrast") {
    // 스펙상 채널별 1차 함수(feComponentTransfer linear)라 대각 행렬과 같다.
    return {
      rows: [
        [amount, 0, 0],
        [0, amount, 0],
        [0, 0, amount],
      ],
      offset: name === "contrast" ? 127.5 * (1 - amount) : 0,
    };
  }

  // grayscale 과 saturate 는 휘도 계수와 s 만 다른 같은 꼴이다.
  const [lr, lg, lb] = name === "grayscale" ? GRAYSCALE_LUMA : SATURATE_LUMA;
  const s = name === "grayscale" ? 1 - amount : amount;
  return {
    rows: [
      [lr + (1 - lr) * s, lg - lg * s, lb - lb * s],
      [lr - lr * s, lg + (1 - lg) * s, lb - lb * s],
      [lr - lr * s, lg - lg * s, lb + (1 - lb) * s],
    ],
    offset: 0,
  };
}

/**
 * `ctx.filter` 를 못 쓰는 브라우저(`canvasFilterSupported`)에서 같은 필터를 **이미 그려진
 * 픽셀**에 굽는다. 사진을 그린 직후, 꾸밈을 얹기 전에 부른다 — 꾸밈까지 물들지 않게.
 *
 * `rect` 는 지금 변환 기준 좌표다. `getImageData` 는 변환을 안 타므로 장치 픽셀로 옮겨
 * **그 칸만** 읽는다 — 예산 배율(`ctx.scale`)이 걸린 16MP 합성 캔버스를 칸마다 통째로
 * 훑지 않는다. 변환은 배율·이동만 본다(호출처 둘 다 회전이 없다).
 *
 * blur 는 굽지 않는다. 크롬의 `ctx.filter` 도 `blur(0.45px)` 로는 1px 선을 하나도
 * 번지게 하지 않는다(실측, 크롬 151 — 1px 부터 번진다). 따라 그리면 오히려 크롬과 갈린다.
 */
export function applyFilterPixels(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  filterId: FourcutFilterId,
) {
  const steps = FILTER_STEPS[filterId];
  if (steps.length === 0) return;

  const { a, d, e, f } = ctx.getTransform();
  const left = Math.round(rect.x * a + e);
  const top = Math.round(rect.y * d + f);
  const image = ctx.getImageData(
    left,
    top,
    Math.round((rect.x + rect.width) * a + e) - left,
    Math.round((rect.y + rect.height) * d + f) - top,
  );
  const { data } = image;

  for (const [name, amount] of steps) {
    if (name === "blur") continue;

    const {
      rows: [[rr, rg, rb], [gr, gg, gb], [br, bg, bb]],
      offset,
    } = colorMatrix(name, amount);
    // Uint8ClampedArray 라 대입이 곧 0..255 자르기·반올림이다. 단계마다 잘리는 것도 스펙과
    // 같다. 알파(i + 3)는 건드리지 않는다.
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      data[i] = rr * r + rg * g + rb * b + offset;
      data[i + 1] = gr * r + gg * g + gb * b + offset;
      data[i + 2] = br * r + bg * g + bb * b + offset;
    }
  }

  ctx.putImageData(image, left, top);
}
