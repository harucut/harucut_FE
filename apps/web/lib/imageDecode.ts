"use client";

/**
 * 고른 파일을 **그릴 수 있는 그림**으로 바꾼다. 브라우저가 못 읽는 형식이면 wasm 으로 푼다.
 *
 * 왜 필요한가: 백엔드가 받는 것은 `GIF·JPEG·PNG·WEBP` 넷뿐인데(`presignedUploadApi.ts` 의
 * `EXTENSION_TO_CONTENT_TYPE`), 아이폰 기본 설정이 만드는 사진은 **HEIC** 다. 예전에는
 * 그냥 걸러 냈다 — 아이폰 사용자가 갤러리에서 고른 사진이 통째로 「지원하지 않는 형식」
 * 이었다.
 *
 * ## 실측 (2026-09-02, 3024×3024 HEIC 한 장)
 *
 * | 엔진 | `<img>` 로 직접 | libheif 로 |
 * |---|---|---|
 * | Chromium (안드로이드 WebView·크롬) | **안 된다** | 디코드 184ms + JPEG 인코드 30ms |
 * | WebKit (iOS Safari·WKWebView) | **된다** (3024×3024) | 디코드 171ms + 인코드 59ms |
 *
 * 그래서 **네이티브를 먼저 시도하고, 실패할 때만 wasm 을 받는다.** iOS 는 wasm 을 아예 안
 * 받고, 안드로이드에서만 받는다. 반대로 하면 되는 브라우저에서도 0.5MB 를 받게 된다.
 *
 * ⚠️ **iOS 는 실기기로 확인하지 못했다.** 위 WebKit 값은 Playwright 의 WebKit 빌드다.
 * 실기기 WKWebView 는 같은 엔진이지만 하드웨어 디코더를 쓰므로 더 빠를 것으로 본다.
 */

import { fitCanvasScale, MAX_TILE_PIXELS } from "@/lib/canvas/canvasBudget";
import {
  isSupportedUploadFile,
  MAX_UPLOAD_BYTES,
  UNSUPPORTED_UPLOAD_MESSAGE,
  UploadValidationError,
} from "@/lib/presignedUploadApi";

/**
 * 캔버스에 그릴 수 있는 형태로 푼 그림.
 *
 * `source` 의 실제 타입은 경로마다 다르다(네이티브는 `HTMLImageElement`, wasm 은
 * `HTMLCanvasElement`). `drawImage` 는 둘 다 받지만 **크기를 읽는 속성 이름이 다르므로**
 * (`naturalWidth` vs `width`) 여기서 숫자로 확정해 넘긴다.
 */
export type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

/**
 * HEIC/HEIF 인가. **확장자나 MIME 이 아니라 바이트로 본다.**
 *
 * 안드로이드 파일 선택기는 HEIC 에 `application/octet-stream` 을 주거나 빈 문자열을 주는
 * 경우가 있고, 공유 시트를 거친 파일은 이름이 `image` 처럼 확장자 없이 오기도 한다.
 * 그때 MIME 만 믿으면 「지원하지 않는 형식」으로 걸러 버린다.
 *
 * ISO BMFF 구조다 — 앞 4바이트가 박스 크기, 다음 4바이트가 `ftyp`, 그다음 4바이트가 브랜드.
 * 브랜드는 HEIC 계열이 여럿이라(`heic`·`heix`·`hevc`·`mif1`·`msf1`·`heim`…) 목록으로 본다.
 */
const HEIF_BRANDS = new Set([
  "heic", // 단일 이미지 (아이폰 사진)
  "heix", // 10비트
  "hevc", // 시퀀스
  "hevx",
  "heim", // 멀티뷰
  "heis",
  "hevm",
  "hevs",
  "mif1", // 일반 이미지 컨테이너 — 아이폰이 실제로 쓴다
  "msf1", // 이미지 시퀀스 (라이브 포토)
]);

export function looksLikeHeif(head: Uint8Array): boolean {
  if (head.length < 12) return false;

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...head.subarray(start, end));

  if (ascii(4, 8) !== "ftyp") return false;

  return HEIF_BRANDS.has(ascii(8, 12).toLowerCase());
}

/**
 * 브라우저에게 그대로 맡겨 본다. 못 읽으면 null.
 *
 * `URL.createObjectURL` 을 쓰는 이유: data URL 로 만들면 파일 하나를 base64 로 통째로
 * 문자열에 올려야 한다(원본 대비 +33%). 폰 사진 여러 장이면 그 자체로 메모리를 먹는다.
 */
function decodeWithBrowser(file: File): Promise<DecodedImage | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      // 그려 넣은 뒤에는 필요 없다. 안 풀면 고른 사진 수만큼 메모리가 남는다.
      URL.revokeObjectURL(objectUrl);

      const { naturalWidth: width, naturalHeight: height } = image;
      resolve(width && height ? { source: image, width, height } : null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    image.src = objectUrl;
  });
}

/** libheif 모듈은 한 번만 받는다. 0.5MB(gzip)라 두 번 받으면 그만큼 두 번이다. */
let libheifPromise: Promise<HeifDecoderModule> | null = null;

type HeifImage = {
  get_width: () => number;
  get_height: () => number;
  display: (
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: unknown) => void,
  ) => void;
};

type HeifDecoderModule = {
  HeifDecoder: new () => { decode: (bytes: Uint8Array) => HeifImage[] };
};

async function loadLibheif(): Promise<HeifDecoderModule> {
  /*
    정적 import 로 두면 HEIC 를 한 장도 안 고른 사람까지 이 덩어리를 받는다.
    첫 HEIC 를 만났을 때만 받는다 — `lib/canvas/personCutout.ts` 가 MediaPipe 를 받는 것과
    같은 이유다.

    `wasm-bundle` 을 고른 이유: wasm 바이너리가 **base64 로 안에 들어 있다.** 따로 받는
    빌드(`libheif-js/wasm`)를 쓰면 `.wasm` 파일 주소를 우리가 서빙해야 하고, 그 주소는
    빌드 산출물 경로에 따라 달라져 조용히 404 가 난다. 크기 차이(1.4MB vs 1.1MB, gzip
    0.5MB)보다 안 깨지는 쪽이 낫다.
  */
  libheifPromise ??= import("libheif-js/wasm-bundle").then(
    (mod) => (mod.default ?? mod) as unknown as HeifDecoderModule,
  );

  try {
    return await libheifPromise;
  } catch (error) {
    /*
      **성공한 로드만 남긴다.** 오프라인이나 청크 오류로 한 번 실패한 거절을 캐시에 두면
      연결이 돌아와 다시 골라도 같은 거절을 그대로 되쓴다 — 새로고침 전까지 이 기기의
      HEIC 변환이 통째로 막힌다(`decodeImageFile` 이 이 오류를 null 로 삼켜 보이지도 않는다).
    */
    libheifPromise = null;
    throw error;
  }
}

/** 시험용. 모듈을 한 번만 받는 캐시를 비운다. */
export function resetLibheifCacheForTest(): void {
  libheifPromise = null;
}

/**
 * 목적지 경계 `dest` 가 가리키는 원본 경계. 타일을 자를 때 양쪽 좌표계를 잇는다.
 *
 * 마지막 경계는 **손으로 못 박는다.** 지금 식(`dest × sourceTotal / destTotal`)은 정수
 * 곱이 2^53 안이라 끝에서 정확히 `sourceTotal` 로 떨어지지만, 그 정확함은 곱하고 나서
 * 나누는 **순서**에 기대는 것이다. 배율을 먼저 구해 곱하는 식으로 바꾸면 마지막 줄이
 * 내림 한 번에 잘려 나가는데, 잘려도 아무 데서도 오류가 안 나고 사진 가장자리 한 줄만
 * 조용히 사라진다 — 그 종류의 손실을 여기서 막는다.
 */
function sourceEdge(dest: number, destTotal: number, sourceTotal: number) {
  if (dest >= destTotal) return sourceTotal;
  return Math.floor((dest * sourceTotal) / destTotal);
}

/**
 * 원본 RGBA 버퍼를 목적지 컨텍스트에 **줄여 그린다.** 줄이는 일은 브라우저가 한다.
 *
 * 무엇이 잘못됐었나: 직전 라운드에 여기 있던 `shrinkPixels` 는 원본 화소를 JS 로 한 번씩
 * 훑어 상자 평균을 냈다. 48MP 사진이면 4,800만 번의 중첩 반복이 메인 스레드에서 통째로
 * 돌고, 그동안 원본 버퍼와 목적지 버퍼를 **같이** 들고 있었다(8064×6048 이면 186MB +
 * 61MB). 이 기계의 데스크톱 Node 로 그 루프만 따로 재니 0.55초였다 — 이 길이 필요한 곳은
 * 폰 Chromium 이라 거기서는 더 느리다(실기기로는 재지 못했다).
 *
 * 어떻게 바꿨나: 원본을 **타일로 잘라** 한 장씩만 임시 캔버스에 얹고(`putImageData` 의
 * dirty rect 로 그 영역만 복사시킨다) 목적지에는 `drawImage` 로 줄여 그린다. JS 쪽 반복은
 * 화소 수가 아니라 **타일 수**가 되고(8064×6048 이면 63장, 파노라마 25344×2048 이면 78장.
 * 이 계산만 따로 돌려 세어 봤다), 추가로 드는 메모리는 타일 한 장(`MAX_TILE_PIXELS` ×
 * 4바이트, 위 두 경우 모두 999×999 로 4MB 아래)뿐이다 — 목적지 크기 RGBA 버퍼를 JS 로
 * 또 만들지 않는다.
 *
 * **원본 버퍼(48MP 면 186MB)는 이 함수가 못 줄인다.** libheif 가 원본 크기로만 채워 주기
 * 때문이다(아래 `decodeWithLibheif` 주석). 최대 메모리의 그 절반은 여기서 안 닫힌다.
 *
 * 왜 가로 띠가 아니라 타일인가: 원본 폭 전체를 띠로 잡으면 아이폰 48MP 의 띠가 8064px 라
 * **변 상한(6000)을 넘는다.** 임시 캔버스도 캔버스라 상한을 넘으면 putImageData 가 조용히
 * 아무것도 안 그리고, 그러면 빈 그림이 그대로 올라간다 — 이 파일이 직전 라운드에 닫은 바로
 * 그 사고를 임시 캔버스로 다시 여는 셈이다. 그래서 폭도 예산으로 자른다.
 *
 * 화질이 **바뀐다**: 상자 평균 → 브라우저 보간이다. 타일 경계는 목적지 정수 화소에 맞춰
 * 자르므로 겹치거나 벌어지지는 않지만, 경계에서 필터가 이웃 타일을 못 보므로 그 한 줄이
 * 전역 축소와 다를 수 있다. **눈으로 확인하지 못했다** — jsdom 에 진짜 캔버스가 없어 이
 * 저장소의 시험으로는 볼 수 없는 종류다. 알파도 브라우저가 미리 곱한 값으로 섞는다(예전
 * 평균은 안 곱했다). 여기 오는 것은 알파 없는 아이폰 사진이라 그대로 뒀다.
 */
function drawShrunkOnto(
  ctx: CanvasRenderingContext2D,
  source: ImageData,
  targetWidth: number,
  targetHeight: number,
): boolean {
  const { width: sourceWidth, height: sourceHeight } = source;

  // 목적지 한 칸이 원본 몇 칸인가. 여기 오는 배율은 1보다 작으므로 둘 다 1 이상이다.
  const stepX = sourceWidth / targetWidth;
  const stepY = sourceHeight / targetHeight;

  /*
    타일 크기는 **목적지 칸 수**로 잡는다 — 그래야 타일의 목적지 사각형이 정수로 떨어져
    경계가 겹치지도 벌어지지도 않는다. 배율이 가로세로 같으므로(`fitCanvasScale`) 이렇게
    잡은 원본 타일은 대체로 정사각형이고, 한 변이 √MAX_TILE_PIXELS(1000px 대)라 변
    상한에도 한참 못 미친다.

    남는 구석: 축소가 1000배를 넘으면(원본 한 변이 목적지의 1000배) 블록이 1칸이 되면서
    타일 하나가 예산을 넘을 수 있다. 그런 사진은 한 변이 수백만 px 이라 실물에 없다.
  */
  const block = Math.max(
    1,
    Math.floor(Math.sqrt(MAX_TILE_PIXELS / (stepX * stepY))),
  );
  const blockWidth = Math.min(targetWidth, block);
  const blockHeight = Math.min(targetHeight, block);

  const tile = document.createElement("canvas");
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return false;

  // 줄여 그리는 길이라 보간을 켠다. 끄면 최근접이 되어 모아레가 그대로 남는다.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let top = 0; top < targetHeight; top += blockHeight) {
    const bottom = Math.min(targetHeight, top + blockHeight);
    const sourceTop = sourceEdge(top, targetHeight, sourceHeight);
    const sourceBottom = sourceEdge(bottom, targetHeight, sourceHeight);

    for (let left = 0; left < targetWidth; left += blockWidth) {
      const right = Math.min(targetWidth, left + blockWidth);
      const sourceLeft = sourceEdge(left, targetWidth, sourceWidth);
      const sourceRight = sourceEdge(right, targetWidth, sourceWidth);

      /*
        크기를 매번 다시 준다. 마지막 줄·마지막 칸은 타일이 작고, 크기를 바꾸면 캔버스가
        비워지므로 앞 타일의 화소가 남지 않는다. 임시 캔버스는 하나만 쓴다 — 타일마다
        새로 만들면 만든 만큼 GC 를 기다리게 된다.
      */
      tile.width = sourceRight - sourceLeft;
      tile.height = sourceBottom - sourceTop;

      /*
        원본 버퍼 전체를 넘기되 **읽을 영역만 지정한다.** dirty rect 는 버퍼 좌표계라,
        놓을 자리를 (-sourceLeft, -sourceTop) 으로 밀어야 타일 좌상단이 (0,0) 이 된다.
        이렇게 하면 타일용 버퍼를 JS 로 따로 만들어 복사하지 않아도 된다.
      */
      tileCtx.putImageData(
        source,
        -sourceLeft,
        -sourceTop,
        sourceLeft,
        sourceTop,
        tile.width,
        tile.height,
      );

      ctx.drawImage(tile, left, top, right - left, bottom - top);
    }
  }

  return true;
}

async function decodeWithLibheif(file: File): Promise<DecodedImage | null> {
  const libheif = await loadLibheif();
  const bytes = new Uint8Array(await file.arrayBuffer());

  const images = new libheif.HeifDecoder().decode(bytes);
  // 라이브 포토처럼 여러 장이 든 컨테이너는 **첫 장**이 대표 이미지다.
  const image = images[0];
  if (!image) return null;

  const width = image.get_width();
  const height = image.get_height();
  if (!width || !height) return null;

  /*
    ── 푸는 캔버스도 예산 안에서 잡는다 ──

    무엇이 잘못됐었나: 여기서는 `canvas.width = 원본폭` 으로 원본 화소 그대로 캔버스를
    잡았다. 굽는 쪽(`encodeAsJpeg`)만 예산에 맞추면, 진짜 상한이 예산과 원본 사이에 있는
    기기에서 **푸는 캔버스만 상한을 넘는다.** 그런 캔버스는 putImageData 가 오류 없이
    아무것도 안 그리는 것으로 알려져 있고(`canvasBudget.ts` 「가정」), 그러면 그 빈
    캔버스를 예산 안 크기로 다시 구워 **빈 그림이 조용히 올라간다.**

    굽는 쪽만 고쳤을 때가 더 나빴다: 그 전에는 두 캔버스가 같이 커서 인코딩도 같이
    실패했고, 사용자는 「지원하지 않는 형식」이라는 **거절**을 봤다. 보이던 실패를 조용한
    데이터 손실로 바꾸는 쪽이라 여기서 닫는다.
  */
  const scale = fitCanvasScale(width, height);
  const targetWidth = Math.max(1, Math.floor(width * scale));
  const targetHeight = Math.max(1, Math.floor(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  /*
    libheif 는 **원본 크기 RGBA 버퍼에만** 채워 준다 — 줄여 달라고 할 수가 없다. 버퍼는
    캔버스가 아니라 그냥 메모리라 캔버스 예산과는 무관하다. 대신 원본 화소 × 4바이트를
    쓰므로 고화소 사진에서는 그 자체로 무겁다(48MP 면 190MB 대). 예전과 같은 비용이고,
    이 자리에서 줄일 방법은 없다.
  */
  const decoded = ctx.createImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    /*
      `display` 는 RGBA 를 우리가 준 버퍼에 채우고 콜백을 부른다. 실패하면 콜백 인자가
      비어 온다 — 여기서 던지지 않고 reject 로 넘긴다. wasm 프레임을 가로질러 던지면
      스택이 끊겨 어디서 죽었는지 알 수 없다(personCutout.ts 에 같은 주석이 있다).
    */
    image.display({ data: decoded.data, width, height }, (result) => {
      if (result) resolve();
      else reject(new Error("libheif display failed"));
    });
  });

  // 예산 안에 드는 사진은 예전 그대로 — 버퍼를 그대로 얹는다(자르지도 줄이지도 않는다).
  if (scale === 1) ctx.putImageData(decoded, 0, 0);
  // 넘는 사진만 타일로 잘라 줄여 그린다. 임시 캔버스를 못 얻으면 그릴 방법이 없다.
  else if (!drawShrunkOnto(ctx, decoded, targetWidth, targetHeight)) return null;

  // 캔버스가 줄어들었으면 **줄어든 크기**를 알린다. 호출부(`encodeAsJpeg`·photoImport)가
  // 이 숫자로 다시 배율을 잡으므로, 원본 크기를 주면 없는 화소를 늘려 그리게 된다.
  return { source: canvas, width: targetWidth, height: targetHeight };
}

/**
 * 어떤 형식이든 그릴 수 있는 그림으로 푼다. 못 풀면 null.
 *
 * 순서가 중요하다.
 *  1. **브라우저에게 먼저 맡긴다** — 되는 곳(WebKit)에서는 wasm 을 아예 안 받는다.
 *  2. 실패했고 바이트가 HEIF 로 보이면 wasm 으로 다시 푼다.
 *
 * 2번의 조건을 「MIME 이 image/heic 인가」로 걸지 않는 이유는 위 `looksLikeHeif` 주석에 있다.
 * 바이트를 읽으려면 앞 12 바이트만 있으면 되므로 `slice` 로 잘라 읽는다 — 파일 전체를
 * 메모리에 올리지 않는다.
 *
 * **머리를 읽는 것까지 오류 경계 안에 둔다.** 아이클라우드에 있어 아직 안 내려받은 사진은
 * 고를 수는 있어도 `arrayBuffer()` 가 거절한다. 그 예외가 밖으로 나가면 호출부
 * (`importPhotoFiles`)가 한 장이 아니라 **같이 고른 사진 전부**를 잃는다.
 */
export async function decodeImageFile(file: File): Promise<DecodedImage | null> {
  const native = await decodeWithBrowser(file);
  if (native) return native;

  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!looksLikeHeif(head)) return null;

    return await decodeWithLibheif(file);
  } catch {
    // 못 읽었거나(클라우드 보관물) 못 받았거나(오프라인) 깨진 파일이다. 호출부가
    // 「읽지 못했다」로 그 한 장만 세어 알린다.
    return null;
  }
}

/**
 * 백엔드가 받는 형식인가 — **파일 이름·MIME 이 아니라 실제로 올릴 수 있는가**로 본다.
 *
 * `isSupportedUploadFile` 만으로 거르면 HEIC 가 여기서 잘려 나가 위 변환 경로에 닿지도
 * 못한다. 그래서 「지금 그대로 올릴 수 있는가」와 「바꿔서 올릴 수 있는가」를 나눈다.
 */
export function canUploadAsIs(file: File): boolean {
  return isSupportedUploadFile(file);
}

/**
 * 「지원하지 않는 형식」을 말하는 예외. 문구의 소유자는 `presignedUploadApi` 다.
 *
 * 그쪽 `createUnsupportedTypeError` 는 내보내지 않으므로 같은 재료로 다시 만든다 —
 * 문구 상수(`UNSUPPORTED_UPLOAD_MESSAGE`)와 예외 타입(`UploadValidationError`)을 함께
 * 가져다 쓰므로, 문구가 바뀌면 여기도 따라 바뀐다.
 */
function createUnsupportedUploadError(file: File) {
  return new UploadValidationError(
    `${UNSUPPORTED_UPLOAD_MESSAGE} (${file.type || file.name})`,
  );
}

/** 변환해서 내보내는 형식. 사진이라 JPEG 가 맞다 — PNG 로 구우면 몇 배가 된다. */
const CONVERTED_MIME = "image/jpeg";
const CONVERTED_QUALITY = 0.92;
const CONVERTED_EXTENSION = "jpg";

/**
 * 줄일 때 계산값보다 한 번 더 당기는 여윳값.
 *
 * 축소율은 「JPEG 크기가 화소 수에 비례한다」로 잡는데, 결이 고운 사진은 그만큼 안 줄어든다.
 * 아슬아슬하게 맞추면 그런 사진에서 한 번 더 굽게 된다.
 */
const SHRINK_MARGIN = 0.9;

/** 푼 그림을 배율만큼 줄여 JPEG 로 굽는다. 캔버스를 못 얻으면 null. */
async function encodeAsJpeg(
  decoded: DecodedImage,
  scale: number,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  /*
    올림이 아니라 **내림**이다. 예산에 딱 맞춘 배율은 올림 한 번에 도로 예산을 넘는다 —
    맞춘 결과가 예산 바로 아래라 한 줄만 붙어도 넘어간다. `composeFrame.ts` 도 같은
    이유로 내림한다. 얼마나 넘는지는 예산 값을 따라 움직이므로 여기 적지 않는다(못은
    아래 `imageDecode.test.ts` 「예산에 맞출 때 올림으로…」가 박고 있다).
    배율이 1일 때는 정수 × 1 이라 내려도 원본 화소 그대로다.
  */
  canvas.width = Math.max(1, Math.floor(decoded.width * scale));
  canvas.height = Math.max(1, Math.floor(decoded.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, CONVERTED_MIME, CONVERTED_QUALITY);
  });
}

/**
 * 백엔드에 **그대로 올릴 수 있는 파일**로 만든다. 이미 올릴 수 있으면 손대지 않는다.
 *
 * 왜 여기서 바꾸나: 프레임 자산·배경·프로필 사진은 촬영 경로와 달리 고른 파일을 **원본
 * 그대로** S3 로 올린다(캔버스를 거치지 않는다). 그래서 아이폰에서 고른 HEIC 는 서버가
 * presign 을 안 내주거나(415 GEN-051) 내주더라도 아무도 못 여는 파일이 된다.
 *
 * 못 읽는 형식이면 **올리기 전에** 던진다. 그 예외는 `presignedUploadApi` 가 쓰는 것과
 * 같은 종류라(`UploadValidationError`) 화면이 이미 한국어로 보여 준다 — 새 문구를 만들면
 * 「지원하지 않는 형식」을 말하는 자리가 두 곳이 된다.
 *
 * 화소를 줄이는 기준은 **둘**이고, 둘 다 「넘을 때만」이다.
 *
 *  1. **캔버스 예산**(`lib/canvas/canvasBudget.ts`) — 첫 굽기부터 `fitCanvasScale` 로
 *     맞춘다(왜인지는 본문 주석). HEIC 를 wasm 으로 푸는 길에서는 `decodeWithLibheif` 가
 *     **푸는 캔버스에도** 같은 배율을 걸어 두므로, 여기 오는 그림은 이미 예산 안이다.
 *  2. **올릴 수 있는 크기** — 그러고도 `MAX_UPLOAD_BYTES`(10MiB)를 넘으면 되풀이해 줄인다.
 *     24MP·48MP 아이폰 사진은 압축된 원본이 작았더라도 다시 구우면 넘길 수 있다 — 그러면
 *     변환까지 해 놓고 `uploadToS3WithPresigned` 가 발급 전에 거절해서, 정작 지원하려던
 *     고해상도 사진만 마지막 단계에서 계속 실패한다.
 *
 * 그 둘뿐이다. 촬영 경로의 상한(`lib/photoImport.ts` 의 `MAX_PIXELS` — 긴 변이 아니라
 * 넓이로 건다)은 네컷 슬롯 크기에서
 * 나온 값이라 프로필 사진이나 스티커에 갖다 쓸 수 없다.
 */
export async function toUploadableFile(file: File): Promise<File> {
  if (canUploadAsIs(file)) return file;

  const decoded = await decodeImageFile(file);
  if (!decoded) throw createUnsupportedUploadError(file);

  /*
    ── 첫 굽기부터 캔버스 예산에 맞춘다 ──

    무엇이 잘못됐었나: 예전에는 크기를 줄일 필요가 있는지 알기도 전에 `scale = 1`, 곧
    **원본 화소 그대로** 캔버스를 잡았다.

    무엇이 그것을 문제로 보게 했나 — 여기서부터는 **가정**이다. iOS 는 캔버스가 상한을
    넘으면 오류를 주지 않고 조용히 빈 그림을 그리거나 `toBlob` 이 null 을 준다고
    **전해진다**(근거와 그 근거의 한계는 `lib/canvas/canvasBudget.ts` 「가정」에 있다.
    실기기로 확인한 적이 없고, 데스크톱 WebKit 에서는 24MP 가 멀쩡히 그려졌다).
    그 이야기가 맞다면 이렇게 된다: 아래 크기 기반 축소 루프는 `blob` 이 null 이라 한 번도
    못 돌고, 밑에서 「지원하지 않는 형식」으로 거절된다. WebKit 이 HEIC 를 **스스로
    읽는데도** 고화소 아이폰 사진만 골라 실패하는 모양이 된다 — 프로필 사진과 프레임
    배경으로 가장 흔히 고르는 것이 하필 그 사진이라, 가정이 맞을 때 치를 값이 크다.
    (사용자가 실제로 그렇게 실패했다는 보고를 우리가 확인한 것은 아니다.)

    숫자를 여기서 새로 정하지 않는다. 예산의 소유자는 `lib/canvas/canvasBudget.ts` 하나고,
    합성(`composeFrame`)도 같은 것을 본다. 숫자를 두 곳에 두면 한쪽만 고쳐지는데, 그때
    갈라지는 쪽이 하필 이 조용한 실패 경로다.

    화질을 필요 이상으로 깎지 않는다: 예산 안에 드는 사진은 배율이 정확히 1이라 예전과
    똑같이 원본 화소로 굽는다. 넘는 사진도 예산에 맞춘 크기가 프로필(원형 수백 px)이나
    프레임 배경(2400px 대)이 요구하는 것보다는 여전히 크다.

    남는 한계: 어떤 기기의 진짜 상한이 예산보다 낮으면 첫 `toBlob` 이 여전히 null 이고,
    우리는 더 줄여 다시 굽지 않고 거절한다. 상한을 재는 방법이 「그려 보고 실패하는지
    본다」뿐이라 비용이 커서, 실기기에서 그런 사례를 만나기 전에는 붙이지 않는다.
  */
  let scale = fitCanvasScale(decoded.width, decoded.height);
  let blob = await encodeAsJpeg(decoded, scale);

  /*
    면적이 한 변의 제곱이라 넘긴 배수의 제곱근만큼 변을 줄이면 대개 한 번에 들어온다.
    JPEG 크기는 그림 내용을 타므로 한 번에 안 들어오는 사진이 있어 되풀이하는데, 배율이
    매번 최소 10%(`SHRINK_MARGIN`)씩 작아지므로 멈춘다.
  */
  while (blob && blob.size > MAX_UPLOAD_BYTES) {
    scale *= Math.sqrt(MAX_UPLOAD_BYTES / blob.size) * SHRINK_MARGIN;
    blob = await encodeAsJpeg(decoded, scale);
  }
  if (!blob) throw createUnsupportedUploadError(file);

  const dot = file.name.lastIndexOf(".");
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || "image";

  return new File([blob], `${base}.${CONVERTED_EXTENSION}`, {
    type: CONVERTED_MIME,
    // 고른 사진의 시각을 잃지 않는다. 보관함 정렬이나 파일명 짓기에 쓰일 수 있다.
    lastModified: file.lastModified,
  });
}
