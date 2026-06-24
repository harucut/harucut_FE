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

  // 같은 이름의 사진 프리뷰가 없는 영상은 downloadUrl이 null이라 미리보기가 비는데,
  // 백엔드가 제공하는 포스터(thumbnailUrl)가 있으면 그걸 이미지 프리뷰로 사용한다.
  if (target.kind === "video" && item.thumbnailUrl) {
    return {
      kind: "image" as const,
      url: item.thumbnailUrl,
    };
  }

  return {
    kind: target.kind,
    url: resolvedUrls[target.media.mediaId] ?? target.media.downloadUrl,
  };
}
