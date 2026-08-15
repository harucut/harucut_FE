"use client";

import type { UserMedia } from "@/lib/api-types";

/**
 * 사람이 붙인 이름이 아니라 기계가 붙인 이름인지 가린다.
 *
 * 기록 목록의 제목이 `3f9a1c2e-...`(S3 키), `KakaoTalk_20260101_193355_1.jpg`(원본
 * 파일명), `harucut_20260416_213654`(서버 기본 이름) 중 하나였다. 셋 다 그날 무엇을
 * 찍었는지 알려주지 않고, 넉 장이 나란히 있으면 서로 구분도 안 된다.
 * 이런 이름은 제목으로 쓰지 않고 날짜로 대신한다.
 */
function isMachineName(name: string) {
  return (
    // 서버 기본 이름: harucut_20260416_213654
    /^harucut[_-]?\d{6,}/i.test(name) ||
    // 메신저·카메라가 붙이는 이름: KakaoTalk_2026..., IMG_1234, PXL_2026..., Screenshot_...
    /^(kakaotalk|img|image|photo|pxl|dsc|screenshot|scaled_image)[_-]/i.test(name) ||
    // UUID
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name) ||
    // 확장자만 달린 파일명
    /\.(png|jpe?g|webp|gif|heic|mp4|mov)$/i.test(name) ||
    // 숫자·기호뿐인 이름
    /^[\d_\-.\s]+$/.test(name)
  );
}

/**
 * 기록이 만들어진 날짜. 서버가 안 주면 null.
 * 표시용이라 사용자 시간대로 읽는다.
 */
export function getUserMediaDate(item: UserMedia): Date | null {
  if (!item.createdAt) return null;
  const date = new Date(item.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
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
 * 기계가 붙인 이름뿐이면 날짜로 부른다. 날짜도 없을 때만 마지막 수단으로 원래 이름을 쓴다.
 */
export function getUserMediaTitle(item: UserMedia, now = new Date()) {
  const preferredName = item.displayName?.trim() || item.displayname?.trim();
  if (preferredName && !isMachineName(preferredName)) return preferredName;

  const dateLabel = getUserMediaDateLabel(item, now);
  if (dateLabel) return `${dateLabel}의 네 컷`;

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
