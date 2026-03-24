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

export function buildDefaultDisplayName(frameName: string, kind: GeneratedFourcutAsset["kind"]) {
  const safeFrameName = sanitizeDisplayName(frameName, "harucut").replace(/\s+/g, "_");
  void kind;
  return `${safeFrameName}-${Date.now()}`;
}

export function buildDownloadFilename(
  displayName: string,
  extension: GeneratedFourcutAsset["extension"],
) {
  const safeName = sanitizeDisplayName(displayName, "harucut");
  return `${safeName}.${extension}`;
}
