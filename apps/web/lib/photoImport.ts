"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import { canUploadAsIs, decodeImageFile, looksLikeHeif } from "@/lib/imageDecode";
import { UNSUPPORTED_UPLOAD_MESSAGE } from "@/lib/presignedUploadApi";

/**
 * 갤러리에서 고른 사진을 촬영본과 **같은 모양**으로 바꾼다.
 *
 * 이 뒤의 단계(4장 고르기 → 서버 합성 → 내려받기)는 사진이 카메라에서 왔는지 파일에서
 * 왔는지 몰라도 된다. 그러려면 여기서 형태를 맞춰 줘야 한다 — 촬영본은 data URL 문자열이다.
 *
 * **비율은 건드리지 않는다.** 합성 단계(`lib/fourcutCompose.ts` `renderSourceForSlot`)가
 * 올리기 전에 슬롯 크기로 `cover` 잘라내고(2026-08-24 실측: 16:9 원본의 모서리가 잘려
 * 나가고 슬롯이 사진으로 꽉 찼다 — 배경색 여백이 남지 않았다), 미리보기도 `object-cover` 라
 * 화면과 결과물이 같은 규칙을 쓴다. 여기서 미리 자르면 뒤 단계가 쓸 수 있었던 화소를
 * 먼저 버리는 셈이다.
 *
 * 크기만 줄인다. 이유가 둘이다.
 *  1. 비회원 결과는 원본 4장을 localStorage 에 보관했다가 로그인 뒤 올린다. 요즘 폰 사진을
 *     그대로 data URL 로 담으면 한 장에 수 MB 라 보관 한도(대개 5MB)에 바로 걸린다.
 *  2. 슬롯보다 큰 화소는 어차피 잘려 나가니 올리는 시간만 늘린다.
 */

/**
 * 긴 변 상한. **모든 슬롯의 가장 긴 변**에 맞춘다(지금은 2400px — wide-4 의 가로 2400,
 * grid-4·polaroid-4 의 세로 2400).
 *
 * 이보다 낮게 잡으면 안 된다. 합성 단계가 캔버스를 슬롯 크기로 잡고 `drawCover` 로 그리는데
 * (`lib/canvas/draw.ts` 의 `scale` 에는 1 상한이 없다) 원본에 화소가 남아 있어도 여기서 이미
 * 버린 뒤라 도로 확대한 그림만 남는다. 예전 상한 2000px 은 classic-4(1700×1200)만 보고
 * 잡은 값이라 wide-4·grid-4·polaroid-4 에서 1.2배 확대를 일으켰다.
 *
 * 레이아웃이 늘거나 커져도 따라오게 숫자를 다시 박지 않고 상수에서 뽑는다.
 */
const MAX_EDGE = Math.max(
  ...Object.values(FRAME_LAYOUTS).flatMap((layout) =>
    layout.slots.map((slot) => Math.max(slot.width, slot.height)),
  ),
);

/** 촬영본과 같은 인코딩(JPEG 0.92)을 쓴다 — 뒤 단계가 둘을 구분하지 않게. */
const JPEG_QUALITY = 0.92;

export type PhotoImportOptions = {
  /**
   * 변환할 최대 장수. **지원 형식만 남긴 뒤에** 자른다.
   *
   * 고른 순서대로 먼저 자르면 못 읽는 파일이 앞에 몰린 선택에서 쓸 수 있는 사진이 통째로
   * 밀려난다(28장 중 앞 24장이 그런 파일이면 남는 것이 0장이었다). 자르는 자리는 그래도
   * 디코딩 앞이라 상한이 막으려던 비용은 그대로 막는다.
   */
  limit?: number;
};

export type PhotoImportResult = {
  /** 촬영본과 같은 형태의 data URL 목록. */
  dataUrls: string[];
  /** 형식이 안 맞거나 읽지 못해 건너뛴 파일이 있으면 사용자에게 보여 줄 문구. */
  notice: string | null;
  /**
   * 상한 때문에 변환하지 않은 장수.
   *
   * 문구는 여기서 만들지 않는다 — 상한이 왜 있는지(세션에 몇 장까지 담는지)는 화면이 안다.
   */
  overLimitCount: number;
};

/**
 * 백엔드가 받는 형식이거나, **바꿔서 보낼 수 있는** 형식인가.
 *
 * 아이폰 기본 설정이 만드는 HEIC 는 백엔드가 안 받지만 여기서 JPEG 로 구워 보내면 된다
 * (`lib/imageDecode.ts`). 그래서 「지금 그대로 올릴 수 있는가」와 「고쳐서 올릴 수 있는가」를
 * 나눠 본다 — 예전에는 앞의 것만 봐서 아이폰 갤러리 사진이 통째로 걸러졌다.
 *
 * HEIF 판정은 **MIME 이 아니라 바이트**로 한다. 안드로이드 파일 선택기는 HEIC 에
 * `application/octet-stream` 을 주거나 아예 빈 문자열을 준다 — MIME 을 믿으면 그 파일들이
 * 여기서 잘려 변환 경로에 닿지도 못한다.
 */
async function canImportPhoto(file: File): Promise<boolean> {
  if (canUploadAsIs(file)) return true;

  /*
    브라우저가 스스로 읽을 수 있는 형식은 통과시킨다 — AVIF 가 그렇다(크롬 85+·사파리
    16.4+). 읽어서 캔버스에 그리면 나가는 것은 어차피 JPEG 이므로 서버 계약과 무관하다.
    못 읽으면 아래 `decodeImageFile` 이 null 을 주고 「읽지 못했어요」로 세어진다.

    동영상을 여기서 막는 것이 이 줄의 일이다. `video/mp4` 는 디코드해 봐야 실패하는데,
    그때 뜨는 문구가 「읽지 못했어요」라 사용자가 무엇이 잘못됐는지 모른다.
  */
  if (file.type.startsWith("image/")) return true;

  // 앞 12 바이트면 브랜드까지 읽힌다. 파일 전체를 메모리에 올리지 않는다.
  // MIME 이 비어 오는 경우(안드로이드 파일 선택기의 HEIC)가 여기로 온다.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  return looksLikeHeif(head);
}

function toScaledDataUrl(image: {
  source: CanvasImageSource;
  width: number;
  height: number;
}): string | null {
  const { width, height } = image;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * 고른 파일들을 촬영본과 같은 data URL 로 바꾼다.
 *
 * **HEIC 는 여기서 JPEG 로 바꿔 준다**(`lib/imageDecode.ts`) — 아이폰 기본 설정이 만드는
 * 형식이라 걸러 내면 아이폰 갤러리 사진이 통째로 막힌다. 그래도 못 읽는 형식(avif·mp4 등)은
 * 걸러 낸다. 그대로 통과시키면 사진을 다 고른 뒤 **합성 단계에서야** 실패해서, 되돌리기
 * 가장 비싼 자리에서 문제를 만난다. 읽지 못한 파일도 같은 이유로 여기서 걸러 개수를 알린다.
 *
 * `limit` 을 주면 개수 상한도 여기서 건다. 형식을 아는 곳이 한 곳뿐이어야
 * "거른 뒤에 자른다"는 순서가 지켜진다.
 */
export async function importPhotoFiles(
  files: File[],
  { limit }: PhotoImportOptions = {},
): Promise<PhotoImportResult> {
  /*
    바이트를 읽어야 해서 비동기다. `filter` 로는 못 하므로 판정을 먼저 모아 놓고 거른다.
    12 바이트씩이라 장수가 많아도 값이 싸다.
  */
  const verdicts = await Promise.all(files.map((file) => canImportPhoto(file)));
  const supported = files.filter((_, index) => verdicts[index]);
  const unsupportedCount = files.length - supported.length;

  const dataUrls: string[] = [];
  let unreadableCount = 0;
  let attempted = 0;

  /*
    상한은 **성공한 장수**로 센다. 「앞에서부터 limit 장을 잘라서 그것만 시도」가 아니다.

    싸게 거를 수 있는 것(동영상, 이미지가 아닌 것)은 위에서 이미 걸렀지만, 남은 것 중에도
    열어 봐야 아는 실패가 있다 — 깨진 파일, 우리가 못 푸는 형식. 그걸 먼저 잘라 두면 그
    실패들이 상한 자리를 먹고 뒤의 멀쩡한 사진이 통째로 밀려난다(28장 중 앞 24장이 그런
    파일이면 남는 것이 0장이었다 — 8-28 에 실제로 그랬다).

    비용은 예전과 같은 자리에 있다. 성공하면 그 즉시 멈추므로 정상적인 선택에서는 딱
    `limit` 장만 푼다. 실패가 있을 때만 그만큼 더 열어 보는데, 그것이 바로 사용자가
    구제받는 경우다.
  */
  for (const file of supported) {
    if (limit != null && dataUrls.length >= Math.max(0, limit)) break;

    attempted += 1;
    const image = await decodeImageFile(file);
    const dataUrl = image ? toScaledDataUrl(image) : null;
    if (dataUrl) dataUrls.push(dataUrl);
    else unreadableCount += 1;
  }

  // 상한을 채워서 **열어 보지도 않은** 장수. 문구는 화면이 만든다(위 타입 주석 참고).
  const overLimitCount = supported.length - attempted;

  const notices: string[] = [];
  if (unsupportedCount > 0) {
    notices.push(
      `${unsupportedCount}장은 지원하지 않는 형식이라 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`,
    );
  }
  if (unreadableCount > 0) {
    notices.push(`${unreadableCount}장은 읽지 못해 제외했어요.`);
  }

  return { dataUrls, notice: notices.join(" ") || null, overLimitCount };
}
