"use client";

import type { UserMedia } from "@/lib/api-types";

export function getUserMediaTitle(item: UserMedia) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName) return preferredName;

  const originalName = item.originalFileName?.trim();
  if (originalName) return originalName;

  return item.s3Key.split("/").pop() || "기록";
}

function normalizeUserMediaTitle(value: string) {
  return value
    .trim()
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}

export function getUserMediaPreviewTarget(item: UserMedia, items: UserMedia[]) {
  if (item.mediaType === "PHOTO") {
    return {
      kind: "image" as const,
      media: item,
    };
  }

  const titleKey = normalizeUserMediaTitle(getUserMediaTitle(item));
  const matchedPhoto = items.find((candidate) => {
    if (candidate.mediaType !== "PHOTO") return false;
    if (candidate.mediaId === item.mediaId) return false;

    return normalizeUserMediaTitle(getUserMediaTitle(candidate)) === titleKey;
  });

  if (matchedPhoto) {
    return {
      kind: "image" as const,
      media: matchedPhoto,
    };
  }

  return {
    kind: "video" as const,
    media: item,
  };
}

export function getUserMediaPreview(
  item: UserMedia,
  items: UserMedia[],
  resolvedUrls: Record<number, string> = {},
) {
  const target = getUserMediaPreviewTarget(item, items);

  return {
    kind: target.kind,
    url: resolvedUrls[target.media.mediaId] ?? target.media.downloadUrl,
  };
}
