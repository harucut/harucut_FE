"use client";

// 결과물은 PNG 이미지 한 종류다. 종류·확장자는 고정이라 값으로 들고 다니지 않는다.
export type GeneratedFourcutAsset = {
  mediaId: number;
  objectUrl: string;
  downloadUrl?: string;
  displayName: string;
};

// 결과물 확장자. 파일명·File 생성에 공통으로 쓴다.
export const FOURCUT_OUTPUT_EXTENSION = "png";

export function sanitizeDisplayName(input: string, fallback: string) {
  const normalized = input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "");

  return normalized || fallback;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// 기본 파일명은 생성 시각만 쓴다(harucut_YYYYMMDD_HHMMSS).
export function buildDefaultDisplayName() {
  const now = new Date();
  const formatted = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join("");
  const time = [
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join("");

  return `harucut_${formatted}_${time}`;
}

export function buildDownloadFilename(
  displayName: string,
  extension: string,
) {
  const safeName = sanitizeDisplayName(displayName, "harucut");
  const normalizedExtension = extension.replace(/^\./, "").toLowerCase();

  if (safeName.toLowerCase().endsWith(`.${normalizedExtension}`)) {
    return safeName;
  }

  return `${safeName}.${normalizedExtension}`;
}
