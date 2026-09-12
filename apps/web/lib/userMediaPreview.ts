"use client";

import { parseServerDateTime } from "@harucut/shared";
import type { UserMedia } from "@/lib/api-types";

/** 표시용으로 확장자를 뗀다. 서버는 저장할 때 이름 뒤에 확장자를 붙여서 돌려준다. */
function withoutExtension(name: string) {
  return name.replace(/\.(png|jpe?g|webp|gif|heic|mp4|mov)$/i, "").trim();
}

/**
 * 사람이 붙인 이름이 아니라 기계가 붙인 이름인지 가린다.
 *
 * 기록 목록의 제목이 `3f9a1c2e-...`(S3 키), `KakaoTalk_20260101_193355_1.jpg`(원본
 * 파일명), `harucut_20260416_213654`(서버 기본 이름) 중 하나였다. 셋 다 그날 무엇을
 * 찍었는지 알려주지 않고, 넉 장이 나란히 있으면 서로 구분도 안 된다.
 * 이런 이름은 제목으로 쓰지 않고 날짜로 대신한다.
 *
 * 판정은 **확장자를 뗀 몸통**으로 한다. 서버가 저장할 때 이름 뒤에 확장자를 붙여 주기 때문에
 * (실측: `연결점검` 으로 저장하면 `연결점검.png` 로 돌아온다), 확장자만 보고 버리면
 * 사용자가 직접 지은 이름까지 전부 날짜로 갈아치운다 — 기록 화면에서 이름을 바꿔도
 * 목록 제목이 그대로인 것처럼 보였다.
 */
function isMachineName(name: string) {
  const stem = withoutExtension(name);
  if (!stem) return true;

  return (
    // 서버 기본 이름: harucut_20260416_213654
    /^harucut[_-]?\d{6,}/i.test(stem) ||
    // 메신저·카메라가 붙이는 이름: KakaoTalk_2026..., IMG_1234, PXL_2026..., Screenshot_...
    // 뒤에 숫자가 붙는 형태만 잡는다 — "IMG_우리집" 같은 건 사람이 지은 이름이다.
    /^(kakaotalk|img|image|photo|pxl|dsc|screenshot|scaled_image)[_-]?\d/i.test(stem) ||
    // UUID
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stem) ||
    // 숫자·기호뿐인 이름
    /^[\d_\-.\s]+$/.test(stem)
  );
}

/**
 * 기록이 만들어진 날짜. 서버가 안 주면 null.
 *
 * 서버의 createdAt 은 오프셋 없는 UTC 다("2026-08-14T18:00:00"). `new Date()` 에 그대로
 * 넣으면 브라우저 로컬 시각으로 읽혀서, 한국에서는 하루 어긋난다 — 같은 화면의 월·일
 * 그룹(기록 목록)과 제목이 다른 날짜를 말하게 된다. 다른 기록 코드와 같은 파서를 쓴다.
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
