"use client";

import { parseServerDateTime } from "@harucut/shared";
import type { UserMedia } from "@/lib/api-types";
import { isMachineName, withoutExtension } from "@/lib/mediaName";

/**
 * 기록이 만들어진 날짜. 서버가 안 주면 null.
 *
 * userMediaApi가 운영의 오프셋 없는 KST를 +09:00로 정규화한다. 제목과 월·일 그룹은
 * 동일한 파서를 써서 같은 날짜를 표시한다. 명시된 UTC/오프셋은 그대로 해석한다.
 */
export function getUserMediaDate(item: UserMedia): Date | null {
  return parseServerDateTime(item.createdAt);
}

/** "8월 15일" — 올해가 아니면 "2025년 8월 15일". */
export function getUserMediaDateLabel(item: UserMedia, now = new Date()) {
  const date = getUserMediaDate(item);
  if (!date) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return sameYear
    ? `${month}월 ${day}일`
    : `${date.getFullYear()}년 ${month}월 ${day}일`;
}

/**
 * 목록에 보일 제목.
 *
 * 사용자가 직접 붙인 이름이 있으면 그것을 쓰고(기록 화면에서 이름을 바꿀 수 있다),
 * 기계가 붙인 이름뿐이면 날짜로 부른다. 날짜도 없으면 s3Key 에서 파일명을 떼어 쓴다.
 */
export function getUserMediaTitle(item: UserMedia, now = new Date()) {
  const preferredName = item.displayName?.trim();
  // 확장자는 사용자가 붙인 게 아니라 서버가 붙인 것이라 제목에서 뗀다.
  if (preferredName && !isMachineName(preferredName)) {
    return withoutExtension(preferredName);
  }

  const dateLabel = getUserMediaDateLabel(item, now);
  if (dateLabel) return `${dateLabel}의 네 컷`;

  if (preferredName) return preferredName;

  return item.s3Key.split("/").pop() || "기록";
}

/**
 * 기록 썸네일에 쓸 이미지 URL. 준비 전이거나 값이 없으면 null.
 * 사진 전용이라 종류 분기는 없다.
 *
 * 우선순위가 중요하다.
 *  - `thumbnailUrl` 은 긴 변 512 축소본이다. 목록에 딱 맞는다.
 *  - `viewUrl` 은 원본이지만 그대로 띄울 수 있다.
 *  - `downloadUrl` 은 `Content-Disposition: attachment` 가 붙어 있어 마지막 수단이다.
 *
 * 예전에는 `downloadUrl` 만 썼다. 목록 한 줄마다 2000×6000 원본을 받아 오는 셈이라,
 * 기록 화면이 항목 수에 비례해 무거웠다.
 */
export function getUserMediaPreviewUrl(item: UserMedia): string | null {
  return (
    item.thumbnailUrl?.trim() ||
    item.viewUrl?.trim() ||
    item.downloadUrl?.trim() ||
    null
  );
}
