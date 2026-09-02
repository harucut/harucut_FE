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

import {
  isSupportedUploadFile,
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

  return libheifPromise;
}

/** 시험용. 모듈을 한 번만 받는 캐시를 비운다. */
export function resetLibheifCacheForTest(): void {
  libheifPromise = null;
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

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.createImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    /*
      `display` 는 RGBA 를 우리가 준 버퍼에 채우고 콜백을 부른다. 실패하면 콜백 인자가
      비어 온다 — 여기서 던지지 않고 reject 로 넘긴다. wasm 프레임을 가로질러 던지면
      스택이 끊겨 어디서 죽었는지 알 수 없다(personCutout.ts 에 같은 주석이 있다).
    */
    image.display({ data: imageData.data, width, height }, (result) => {
      if (result) resolve();
      else reject(new Error("libheif display failed"));
    });
  });

  ctx.putImageData(imageData, 0, 0);

  return { source: canvas, width, height };
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
 */
export async function decodeImageFile(file: File): Promise<DecodedImage | null> {
  const native = await decodeWithBrowser(file);
  if (native) return native;

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!looksLikeHeif(head)) return null;

  try {
    return await decodeWithLibheif(file);
  } catch {
    // 못 받았거나(오프라인) 깨진 파일이다. 호출부가 「읽지 못했다」로 세어 알린다.
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
 * 크기는 **안 줄인다.** 형식만 바꾼다. 줄이는 규칙을 아는 곳은 촬영 경로
 * (`lib/photoImport.ts` 의 `MAX_EDGE`)이고, 그 규칙은 네컷 슬롯 크기에서 나온다 —
 * 프로필 사진이나 스티커에 갖다 쓸 값이 아니다.
 */
export async function toUploadableFile(file: File): Promise<File> {
  if (canUploadAsIs(file)) return file;

  const decoded = await decodeImageFile(file);
  if (!decoded) throw createUnsupportedUploadError(file);

  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw createUnsupportedUploadError(file);

  ctx.drawImage(decoded.source, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, CONVERTED_MIME, CONVERTED_QUALITY);
  });
  if (!blob) throw createUnsupportedUploadError(file);

  const dot = file.name.lastIndexOf(".");
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name).trim() || "image";

  return new File([blob], `${base}.${CONVERTED_EXTENSION}`, {
    type: CONVERTED_MIME,
    // 고른 사진의 시각을 잃지 않는다. 보관함 정렬이나 파일명 짓기에 쓰일 수 있다.
    lastModified: file.lastModified,
  });
}
