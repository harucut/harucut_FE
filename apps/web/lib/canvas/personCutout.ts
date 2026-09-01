"use client";

import { loadImage } from "@/lib/canvas/loaders";
import type { ImageSegmenter } from "@mediapipe/tasks-vision";

/**
 * 사진 한 장에서 **사람만 남기고 배경을 검정으로 구운** JPEG 을 만든다.
 *
 * ## 왜 여기서 굽나
 *
 * 백엔드 스펙(`FrameCreateRequest.cellCutouts` 스웨거 설명)이 못박는다 —
 * *"서버는 이 값으로 아무것도 그리지 않는다. 누끼(배경 제거 + 검은 배경)는 프론트가 원본
 * 픽셀에 구워서 업로드해야 한다."* `cellCutouts` 토글은 편집기가 저장 프레임을 다시 열 때
 * 어느 칸이 누끼인지 **복원하는 용도**다. 근거와 미해결 쟁점은
 * `docs/backend-contract.md` 「누끼 한 줄은 지금 스웨거와 반대다」 절.
 *
 * ## 무엇으로 하나 — 사람 전용 모델
 *
 * MediaPipe `selfie_segmenter`(float16) + `@mediapipe/tasks-vision`.
 * 갤럭시 A32 · 안드로이드 13 · Chrome 151 에서 입력 1700×1700 으로 직접 잰 값이다.
 *
 * | 구간 | 시간 |
 * |---|---|
 * | 모델 준비(CPU) | 724ms ← 한 번만 |
 * | 1장째 | 845ms |
 * | 2·3장째 | 446ms / 413ms |
 * | 4장 합계 | 약 2.1초 |
 *
 * 출력은 검은 배경 JPEG **183KB**(같은 그림을 PNG 로 내보내면 장당 2MB).
 *
 * 대조군으로 `@imgly/background-removal`(isnet_quint8, 범용 매팅)을 같은 기기에서 재 봤더니
 * **장당 61초**였다. 사람 전용 모델이라 130배 빠르다. 그래서 테마 에디터의 에셋 경로
 * (`lib/backgroundRemoval.ts`)와 이 파일은 **다른 모델을 쓴다** — 거기는 대상이 사람이
 * 아닐 수 있어 범용 매팅이 맞고, 여기는 항상 사람이라 사람 전용이 맞다.
 *
 * ## 반드시 지켜야 하는 세 가지 (전부 실측이다. 어기면 조용히 깨진다)
 *
 * 1. **`delegate` 는 `'CPU'`.** 이 기기에서 `delegate:'GPU'` 는 **전부 0인 빈 마스크**를
 *    즉시 돌려줬다(categoryMask 값 분포 `{0: 3712}`, confidenceMask 전부 0.00).
 *    빠른 게 아니라 아무것도 안 한 것이다. → `SEGMENTER_OPTIONS`
 * 2. **사람 카테고리를 하드코딩하지 않는다.** `getLabels()` 가 `["selfie"]` 를 돌려주고
 *    categoryMask 에서 **사람 픽셀이 0**, 배경이 255 였다. 반대로 잡으면 사람이 지워지고
 *    배경만 남는다(실제로 그렇게 나왔다). → `resolvePersonCategoryValue`
 * 3. **출력은 검은 배경 JPEG.** 스펙이 "배경 제거 + 검은 배경"이라 알파가 필요 없다.
 *    알파를 0 으로만 두고 JPEG 으로 내보내면 브라우저마다 검정/흰색으로 갈리므로,
 *    배경 픽셀에 **불투명 검정을 직접 쓴다**. → `paintBackgroundBlack`
 *
 * ## 실패하면 조용히 원본으로 돌아간다
 *
 * 모델은 네트워크에서 온다. 오프라인·차단·모르는 모델이면 `PersonCutoutUnavailableError`
 * 를 던진다 — 호출부는 `isPersonCutoutUnavailable()` 로 걸러 **손대지 않은 원본 사진**을
 * 그대로 쓰면 된다. 누끼 하나 때문에 촬영 전체를 잃지 않는 것이 이 에러의 존재 이유다.
 */

/** 실측한 버전. 올릴 때는 기기에서 다시 재고 위 표의 숫자를 갱신한다. */
const MEDIAPIPE_VERSION = "1.0.1";

/**
 * wasm 과 모델을 어디서 받나 — 지금은 **CDN**, 자체 호스팅으로 바꿀 여지를 env 로 열어 둔다.
 *
 * 외부 주소가 이 앱에서 실제로 닿는지 먼저 확인했다.
 * - `next.config.ts` 의 `SECURITY_HEADERS` 에 **CSP 가 없다**(인라인 테마 부트스트랩 때문에
 *   nonce 설계를 미뤄 뒀다고 그 파일 주석이 적는다). 그래서 지금은 막는 것이 없다.
 * - `proxy.ts` 는 **동일 출처 라우트의 보호 판정**만 한다. 브라우저가 외부 출처로 보내는
 *   요청에는 관여하지 않는다.
 * - 두 주소 모두 200 을 확인했다(모델 249,537B).
 *
 * 그래도 자체 호스팅이 최종적으로는 낫다. 세 가지 이유다.
 * 1. CSP 가 붙는 순간 조용히 깨진다. wasm 로더는 스크립트로 실행되고 `.wasm`·`.tflite` 는
 *    fetch 다 — `script-src`·`connect-src`·`wasm-unsafe-eval` 셋을 CDN 출처로 열어 줘야 한다.
 * 2. 앱은 WebView 셸이라(ADR-0003) 모바일 네트워크를 탄다. 동일 출처 자산은
 *    `next.config.ts` 의 `Cache-Control` 정책을 그대로 받는다.
 * 3. 모델 주소의 `latest` 는 파일이 바뀔 수 있다. 그래서 여기서는 **버전 경로 `/1/`** 을 쓴다.
 *
 * 자체 호스팅으로 넘기는 방법(코드 수정 없음):
 * `node_modules/@mediapipe/tasks-vision/wasm` 을 `public/mediapipe/wasm` 으로,
 * 모델 파일을 `public/mediapipe/selfie_segmenter.tflite` 로 복사한 뒤
 * `NEXT_PUBLIC_MEDIAPIPE_WASM_BASE=/mediapipe/wasm`,
 * `NEXT_PUBLIC_SELFIE_SEGMENTER_URL=/mediapipe/selfie_segmenter.tflite` 를 준다.
 */
const DEFAULT_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const DEFAULT_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";

const WASM_BASE =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_BASE?.trim() || DEFAULT_WASM_BASE;
const MODEL_URL =
  process.env.NEXT_PUBLIC_SELFIE_SEGMENTER_URL?.trim() || DEFAULT_MODEL_URL;

/** 촬영(`useCaptureFlow`)이 쓰는 JPEG 품질과 같은 값. 결과물의 결이 갈리지 않게 맞춘다. */
const DEFAULT_JPEG_QUALITY = 0.92;

/** 왜 이 실패인지. 호출부가 로그로 남기고 사람이 원인을 좁힐 수 있게 갈라 둔다. */
export type PersonCutoutFailureReason =
  /** 라이브러리·wasm·모델을 받지 못했다(오프라인, 차단된 CDN). */
  | "model-load"
  /** `getLabels()` 가 우리가 모르는 모델을 가리킨다. 극성을 찍어 맞히지 않는다. */
  | "unknown-labels"
  /** 원본 사진을 디코드하지 못했다. */
  | "source-load"
  /** 2D 컨텍스트를 얻지 못했다. */
  | "canvas"
  /** 세그멘테이션은 돌았는데 categoryMask 가 없다. */
  | "no-mask"
  /** 사람으로 판정된 픽셀이 한 개도 없다 — 그대로 내보내면 검은 사각형이다. */
  | "empty-mask"
  /** JPEG 인코딩이 null 을 줬다. */
  | "encode";

/**
 * 누끼를 만들지 못했다. **촬영 실패가 아니다** — 호출부는 원본 사진으로 계속 간다.
 */
export class PersonCutoutUnavailableError extends Error {
  readonly reason: PersonCutoutFailureReason;

  constructor(
    reason: PersonCutoutFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PersonCutoutUnavailableError";
    this.reason = reason;
  }
}

/** 원본으로 돌아가야 하는 실패인가. 호출부의 `catch` 는 이것만 보면 된다. */
export function isPersonCutoutUnavailable(
  error: unknown,
): error is PersonCutoutUnavailableError {
  return error instanceof PersonCutoutUnavailableError;
}

/**
 * 사람 라벨로 인정하는 말. `selfie_segmenter` 는 `["selfie"]` 하나를 준다(실측).
 * 다른 사람 전용 모델을 붙일 때를 대비해 몇 개 더 받아 둔다.
 */
const PERSON_LABEL = /selfie|person|people|human|portrait/i;

/** 배경 라벨. 사람 라벨 검사보다 먼저 걸러 극성이 뒤집히는 것을 막는다. */
const BACKGROUND_LABEL = /background|배경/i;

/**
 * categoryMask 에서 **사람을 뜻하는 값**을 고른다. 없으면 `null`.
 *
 * categoryMask 의 픽셀 값은 카테고리 인덱스다. 그래서 `getLabels()` 에서 사람 라벨이 몇 번째인지
 * 찾으면 그게 곧 마스크 값이다. **실측한 답은 인덱스 0 / 마스크 값 0** 이었다
 * (`getLabels() === ["selfie"]`, 사람 픽셀 0, 배경 255). 그 0 을 코드에 박지 않는 이유는
 * 값이 모델에 딸린 것이라서다 — 모델을 바꾸면 같이 바뀐다.
 *
 * 라벨이 **비어 있으면** 0 을 쓴다. tflite 에 labelmap 이 없는 모델이고, 그때 카테고리는
 * 하나뿐이라 0 이 그 하나다 — 실측한 그 경우다.
 *
 * 라벨이 **있는데 사람이 안 보이면 `null`** 이다. 찍어서 맞히지 않는다. 예를 들어
 * `selfie_multiclass`(`["background","hair","body-skin",...]`)로 주소만 바꿔 끼우면
 * 0 번은 배경이라, 0 으로 넘겨짚는 순간 사람이 지워지고 배경만 남는다.
 */
export function resolvePersonCategoryValue(
  labels: readonly string[],
): number | null {
  if (labels.length === 0) return 0;

  const index = labels.findIndex((label) => {
    const normalized = label.trim();
    if (!normalized) return false;
    if (BACKGROUND_LABEL.test(normalized)) return false;
    return PERSON_LABEL.test(normalized);
  });

  return index >= 0 ? index : null;
}

/**
 * 사람이 아닌 픽셀을 **불투명 검정**으로 덮는다. `pixels` 를 제자리에서 고친다.
 *
 * 제자리에서 고치는 이유 — 1700×1700 RGBA 가 한 장에 11.6MB 다. 결과를 새로 할당하면
 * 4장 도는 동안 그만큼이 두 배로 든다.
 *
 * **마스크는 자기 해상도로 온다**(모델 입력 크기, 원본보다 대개 훨씬 작다). 그래서 원본
 * 좌표를 마스크 좌표로 줄여 읽는다 — 최근접 이웃이다. 가로 대응표(`xMap`)를 한 번만 만들어
 * 픽셀마다 나눗셈하지 않는다. 마지막 칸의 `Math.min` 은 방어선이다 — 지금 식에서는
 * `x < width` 면 늘 범위 안이지만, 크기를 잘못 넘겼을 때 마스크 밖을 읽어 `undefined`
 * (= 배경 취급 = 검정)가 되는 것보다 가장 가까운 칸을 읽는 편이 덜 나쁘다.
 *
 * @returns 사람으로 판정된 픽셀 수. 0 이면 마스크가 깨진 것이다 — 호출부가 던진다.
 */
export function paintBackgroundBlack(args: {
  /** RGBA, `width * height * 4` 길이. 제자리에서 고쳐진다. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** categoryMask 원본, `maskWidth * maskHeight` 길이. */
  mask: Uint8Array | Uint8ClampedArray;
  maskWidth: number;
  maskHeight: number;
  /** 사람을 뜻하는 마스크 값(`resolvePersonCategoryValue`). 실측 0. */
  personCategoryValue: number;
}): number {
  const {
    pixels,
    width,
    height,
    mask,
    maskWidth,
    maskHeight,
    personCategoryValue,
  } = args;

  if (width <= 0 || height <= 0 || maskWidth <= 0 || maskHeight <= 0) return 0;

  const xMap = new Int32Array(width);
  for (let x = 0; x < width; x += 1) {
    xMap[x] = Math.min(maskWidth - 1, Math.floor((x * maskWidth) / width));
  }

  let personPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const maskRow =
      Math.min(maskHeight - 1, Math.floor((y * maskHeight) / height)) * maskWidth;
    const pixelRow = y * width * 4;

    for (let x = 0; x < width; x += 1) {
      if (mask[maskRow + xMap[x]] === personCategoryValue) {
        personPixels += 1;
        continue;
      }

      const p = pixelRow + x * 4;
      pixels[p] = 0;
      pixels[p + 1] = 0;
      pixels[p + 2] = 0;
      // 알파까지 채운다. 투명한 채로 JPEG 으로 내보내면 브라우저가 알아서 합성하는데,
      // 그 바탕색이 엔진마다 다르다(검정/흰색). 검은 배경을 스펙이 요구하므로 직접 쓴다.
      pixels[p + 3] = 255;
    }
  }

  return personPixels;
}

const SEGMENTER_OPTIONS = {
  baseOptions: {
    modelAssetPath: MODEL_URL,
    // 'GPU' 로 두면 이 기기(갤럭시 A32 · 안드로이드 13 · Chrome 151)에서 **전부 0인 빈
    // 마스크**가 즉시 돌아온다 — 오류도 경고도 없다. 빠른 게 아니라 아무것도 안 한 것이다.
    // CPU 로 모델 준비 724ms, 장당 400~850ms 면 4컷에 충분하다. 바꾸려면 실기기 재측정부터.
    delegate: "CPU",
  },
  runningMode: "IMAGE",
  // 우리가 쓰는 것은 카테고리 마스크 하나다. confidenceMask 는 켜 두면 같은 크기의
  // Float32 버퍼가 더 나온다 — 안 쓸 것을 만들 이유가 없다.
  outputCategoryMask: true,
  outputConfidenceMasks: false,
} as const;

/**
 * 모델은 한 번만 올린다.
 *
 * 준비에만 724ms 다. 장마다 다시 만들면 4컷에 2.9초를 그냥 버린다(실측 4장 합계가 2.1초다).
 *
 * **실패도 캐시한다.** 오프라인이면 4장이 각자 다시 받으러 나갔다가 각자 기다린다.
 * 한 번 실패한 것은 이 페이지가 살아 있는 동안 계속 실패한 것으로 본다 — 새로고침이면 풀린다.
 */
let segmenterPromise: Promise<ImageSegmenter> | null = null;

function getSegmenter(): Promise<ImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;

  segmenterPromise = (async () => {
    // 라이브러리·wasm·모델 셋 다 첫 사용 때 받는다. 정적 import 로 두면 촬영과 무관한
    // 화면까지 번들이 무거워진다 — `lib/backgroundRemoval.ts` 가 쓰는 방식과 같다.
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    return vision.ImageSegmenter.createFromOptions(fileset, SEGMENTER_OPTIONS);
  })().catch((cause) => {
    throw new PersonCutoutUnavailableError(
      "model-load",
      "배경 제거 모델을 불러오지 못했어요.",
      { cause },
    );
  });

  return segmenterPromise;
}

/**
 * 모델을 미리 올려 둔다. 성공하면 `true`.
 *
 * 촬영을 시작할 때 불러 두면 첫 컷이 724ms 를 내지 않는다 — 카운트다운이 도는 동안이
 * 그 자리다. 실패해도 던지지 않는다(호출부가 미리 알고 누끼 UI 를 접을 수 있게 `false`).
 */
export async function preloadPersonCutout(): Promise<boolean> {
  try {
    await getSegmenter();
    return true;
  } catch {
    return false;
  }
}

/**
 * 넣을 수 있는 사진.
 *
 * 세션이 들고 있는 것은 **JPEG data URL 문자열**이다(`useCaptureFlow` 의
 * `capturePhotoToDataUrl` → `addShotPhoto`). 그래서 `string` 이 기본 입력이다.
 * 합성 경로는 그 문자열을 이미 `HTMLImageElement` 로 풀어 두므로
 * (`composeFrame.ts` 의 `loadDrawables`), 두 번 디코드하지 않게 엘리먼트도 받는다.
 * `ImageBitmap` 은 스틸 촬영(`stillCapture.ts`)이 주는 형태다.
 */
export type PersonCutoutSource =
  | string
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

export type PersonCutoutOptions = {
  /** JPEG 품질. 기본 0.92 — 촬영과 같은 값이다. */
  quality?: number;
};

export type PersonCutoutResult = {
  /** `image/jpeg`. 사람만 남고 배경은 순수 검정이다. */
  blob: Blob;
  width: number;
  height: number;
  /** 사람으로 판정된 픽셀 수. QA 로그용 — 여기까지 왔으면 항상 1 이상이다. */
  personPixels: number;
};

function sizeOf(source: Exclude<PersonCutoutSource, string>) {
  // `naturalWidth` 로 가른다 — jsdom 처럼 `HTMLImageElement` 가 다르게 사는 환경에서도
  // `instanceof` 보다 안전하다.
  if ("naturalWidth" in source) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

async function resolveSource(
  source: PersonCutoutSource,
): Promise<Exclude<PersonCutoutSource, string>> {
  if (typeof source !== "string") return source;

  try {
    return await loadImage(source);
  } catch (cause) {
    throw new PersonCutoutUnavailableError(
      "source-load",
      "사진을 불러오지 못했어요.",
      { cause },
    );
  }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new PersonCutoutUnavailableError(
              "encode",
              "누끼 이미지를 만들지 못했어요.",
            ),
          );
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * 사진 한 장 → **사람만 남고 배경이 검은** JPEG.
 *
 * 실패하면 `PersonCutoutUnavailableError` 를 던진다. 호출부는 잡아서 원본을 그대로 쓴다 —
 * 여기서 던지는 것 중 촬영을 되돌려야 하는 것은 하나도 없다.
 *
 * 결과가 `Blob` 인 이유는 업로드(`FOURCUT_SOURCE` presigned PUT)가 그걸 받기 때문이다.
 * 세션에 다시 얹으려면 호출부가 data URL 로 바꾼다 — 비회원 인계가 localStorage 라
 * 세션은 문자열만 들고 있을 수 있다(`lib/pendingGuestSave.ts`).
 */
export async function cutoutPersonOnBlack(
  source: PersonCutoutSource,
  options: PersonCutoutOptions = {},
): Promise<PersonCutoutResult> {
  const { quality = DEFAULT_JPEG_QUALITY } = options;

  const segmenter = await getSegmenter();
  const image = await resolveSource(source);
  const { width, height } = sizeOf(image);

  if (width <= 0 || height <= 0) {
    throw new PersonCutoutUnavailableError(
      "source-load",
      "사진 크기를 읽지 못했어요.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // 배경을 픽셀로 직접 칠하므로 알파 채널이 필요 없다. 끄면 브라우저가 불투명 버퍼를 쓴다.
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new PersonCutoutUnavailableError(
      "canvas",
      "2d 컨텍스트를 얻지 못했어요.",
    );
  }

  try {
    ctx.drawImage(image, 0, 0, width, height);

    // 원본이 아니라 **캔버스**를 넘긴다. 마스크를 덮을 픽셀과 세그멘테이션이 본 픽셀이
    // 같은 그림이어야 좌표가 어긋나지 않는다(EXIF 회전·크기 조정이 여기서 이미 끝난다).
    const imageData = ctx.getImageData(0, 0, width, height);

    /*
      결과를 객체에 담는 이유는 두 가지다.
      - 콜백 안에서 지역 `let` 에 쓰면 TypeScript 가 그 대입을 못 보고 콜백 뒤의 값을
        초깃값으로 좁혀 버린다(콜백 대입은 흐름 분석 밖이다).
      - 실패를 던지지 않고 들고 나온다. 콜백 안에서 던지면 wasm 프레임을 가로질러 던지는
        것이라 예외가 어디로 갈지 보장되지 않는다.
    */
    const outcome: {
      personPixels: number;
      failure: PersonCutoutUnavailableError | null;
    } = { personPixels: 0, failure: null };

    // 콜백형 `segment()` 는 **동기로 끝난다**(호출이 콜백 반환 뒤 돌아온다). 결과를 복사하지
    // 않는 대신 마스크 수명이 콜백 안뿐이라, 덮어쓰기까지 전부 여기서 끝낸다.
    // (인자 없는 `segment(image)` 형은 마스크를 통째로 복사한다 — 1700×1700 에서 그 복사는
    //  공짜가 아니고, 우리는 콜백 안에서 다 쓰고 나온다.)
    segmenter.segment(canvas, (result) => {
      const mask = result.categoryMask;
      if (!mask) {
        outcome.failure = new PersonCutoutUnavailableError(
          "no-mask",
          "세그멘테이션 마스크가 비어 있어요.",
        );
        return;
      }

      const personCategoryValue = resolvePersonCategoryValue(
        segmenter.getLabels(),
      );
      if (personCategoryValue === null) {
        outcome.failure = new PersonCutoutUnavailableError(
          "unknown-labels",
          "모르는 세그멘테이션 모델이라 사람 카테고리를 정하지 못했어요.",
        );
        return;
      }

      outcome.personPixels = paintBackgroundBlack({
        pixels: imageData.data,
        width,
        height,
        mask: mask.getAsUint8Array(),
        maskWidth: mask.width,
        maskHeight: mask.height,
        personCategoryValue,
      });

      // `mask.close()` 는 부르지 않는다 — 태스크가 소유한 마스크는 콜백을 빠져나가는 순간
      // 자동으로 해제된다고 라이브러리 d.ts 가 명시한다. 여기서 부르면 하는 일이 없다.
    });

    if (outcome.failure) throw outcome.failure;
    const { personPixels } = outcome;

    // 사람이 한 픽셀도 없으면 그대로 내보낼 때 **검은 사각형**이 된다. GPU delegate 가
    // 빈 마스크를 주던 실측이 정확히 이 모양이었다 — 조용히 통과시키지 않는다.
    if (personPixels === 0) {
      throw new PersonCutoutUnavailableError(
        "empty-mask",
        "사람을 찾지 못했어요.",
      );
    }

    ctx.putImageData(imageData, 0, 0);
    const blob = await toJpegBlob(canvas, quality);

    return { blob, width, height, personPixels };
  } finally {
    // 캔버스는 GC 를 기다린다. 4장을 도는 흐름이라 1700×1700 짜리가 쌓이면 그대로 메모리다.
    // 0 으로 줄여 버퍼를 즉시 놓아준다.
    canvas.width = 0;
    canvas.height = 0;
  }
}
