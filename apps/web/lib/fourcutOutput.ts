"use client";

export type GeneratedFourcutAsset = {
  mediaId: number;
  kind: "IMAGE" | "VIDEO";
  objectUrl: string;
  downloadUrl?: string;
  extension: "png" | "mp4" | "webm";
  displayName: string;
};

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

export function buildDefaultDisplayName(frameName: string, kind: GeneratedFourcutAsset["kind"]) {
  void frameName;
  void kind;
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
