"use client";

import {
  isSupportedUploadFile,
  UNSUPPORTED_UPLOAD_MESSAGE,
} from "@/lib/presignedUploadApi";

/**
 * 갤러리에서 고른 사진을 촬영본과 **같은 모양**으로 바꾼다.
 *
 * 이 뒤의 단계(4장 고르기 → 서버 합성 → 내려받기)는 사진이 카메라에서 왔는지 파일에서
 * 왔는지 몰라도 된다. 그러려면 여기서 형태를 맞춰 줘야 한다 — 촬영본은 data URL 문자열이다.
 *
 * **비율은 건드리지 않는다.** 서버 합성이 슬롯에 `cover` 로 맞춰 자르고(2026-08-24 실측:
 * 16:9 원본의 모서리가 잘려 나가고 슬롯이 사진으로 꽉 찼다 — 배경색 여백이 남지 않았다),
 * 미리보기도 `object-cover` 라 화면과 결과물이 같은 규칙을 쓴다. 여기서 미리 자르면
 * 서버가 쓸 수 있었던 화소를 먼저 버리는 셈이다.
 *
 * 크기만 줄인다. 이유가 둘이다.
 *  1. 비회원 결과는 원본 4장을 localStorage 에 보관했다가 로그인 뒤 올린다. 요즘 폰 사진을
 *     그대로 data URL 로 담으면 한 장에 수 MB 라 보관 한도(대개 5MB)에 바로 걸린다.
 *  2. 슬롯이 가장 큰 프레임도 1700×1200 이라 그 이상은 올리는 시간만 늘린다.
 */

/** 긴 변 상한. classic-4 슬롯(1700px)보다 넉넉하되 낭비하지 않는 선. */
const MAX_EDGE = 2000;

/** 촬영본과 같은 인코딩(JPEG 0.92)을 쓴다 — 뒤 단계가 둘을 구분하지 않게. */
const JPEG_QUALITY = 0.92;

export type PhotoImportResult = {
  /** 촬영본과 같은 형태의 data URL 목록. */
  dataUrls: string[];
  /** 형식이 안 맞아 건너뛴 파일이 있으면 사용자에게 보여 줄 문구. */
  notice: string | null;
};

function readAsImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      // 그려 넣은 뒤에는 필요 없다. 안 풀면 고른 사진 수만큼 메모리가 남는다.
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    image.src = objectUrl;
  });
}

function toScaledDataUrl(image: HTMLImageElement): string | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * 고른 파일들을 촬영본과 같은 data URL 로 바꾼다.
 *
 * 지원하지 않는 형식(heic·avif 등)은 걸러 낸다. 그대로 통과시키면 사진을 다 고른 뒤
 * **합성 단계에서야** 실패해서, 되돌리기 가장 비싼 자리에서 문제를 만난다.
 * 읽지 못한 파일도 같은 이유로 여기서 걸러 개수를 알린다.
 */
export async function importPhotoFiles(
  files: File[],
): Promise<PhotoImportResult> {
  const supported = files.filter((file) => isSupportedUploadFile(file));
  const unsupportedCount = files.length - supported.length;

  const dataUrls: string[] = [];
  let unreadableCount = 0;

  for (const file of supported) {
    const image = await readAsImage(file);
    const dataUrl = image ? toScaledDataUrl(image) : null;
    if (dataUrl) dataUrls.push(dataUrl);
    else unreadableCount += 1;
  }

  const notices: string[] = [];
  if (unsupportedCount > 0) {
    notices.push(
      `${unsupportedCount}장은 지원하지 않는 형식이라 제외했어요. ${UNSUPPORTED_UPLOAD_MESSAGE}`,
    );
  }
  if (unreadableCount > 0) {
    notices.push(`${unreadableCount}장은 읽지 못해 제외했어요.`);
  }

  return { dataUrls, notice: notices.join(" ") || null };
}
