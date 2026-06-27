"use client";

import type { UserMedia } from "@/lib/api-types";

export function getUserMediaTitle(item: UserMedia) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName) return preferredName;

  const originalName = item.originalFileName?.trim();
  if (originalName) return originalName;

  return item.s3Key.split("/").pop() || "기록";
}

export function getUserMediaPreview(
  item: UserMedia,
  items: UserMedia[],
  resolvedUrls: Record<number, string> = {},
) {
  void items;

  return {
    kind: "image" as const,
    url: resolvedUrls[item.mediaId] ?? item.downloadUrl,
  };
}
