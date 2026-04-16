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
  return value.trim().toLowerCase();
}

export function getUserMediaPreview(item: UserMedia, items: UserMedia[]) {
  if (item.mediaType === "PHOTO") {
    return {
      kind: "image" as const,
      url: item.downloadUrl,
    };
  }

  const titleKey = normalizeUserMediaTitle(getUserMediaTitle(item));
  const matchedPhoto = items.find((candidate) => {
    if (candidate.mediaType !== "PHOTO") return false;
    if (!candidate.downloadUrl) return false;
    if (candidate.mediaId === item.mediaId) return false;

    return normalizeUserMediaTitle(getUserMediaTitle(candidate)) === titleKey;
  });

  if (matchedPhoto?.downloadUrl) {
    return {
      kind: "image" as const,
      url: matchedPhoto.downloadUrl,
    };
  }

  return {
    kind: "video" as const,
    url: item.downloadUrl,
  };
}
