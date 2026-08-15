"use client";

import type { UserMedia } from "@/lib/api-types";

export function getUserMediaTitle(item: UserMedia) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName) return preferredName;

  const originalName = item.originalFileName?.trim();
  if (originalName) return originalName;

  return item.s3Key.split("/").pop() || "기록";
}

/**
 * 기록 썸네일에 쓸 이미지 URL. 준비 전이거나 값이 없으면 null.
 * 사진 전용이라 종류 분기는 없다.
 */
export function getUserMediaPreviewUrl(item: UserMedia): string | null {
  return item.downloadUrl?.trim() || null;
}
