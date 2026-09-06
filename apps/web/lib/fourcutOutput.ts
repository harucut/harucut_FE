"use client";

// 결과물은 PNG 이미지 한 종류다. 종류·확장자는 고정이라 값으로 들고 다니지 않는다.
export type GeneratedFourcutAsset = {
  mediaId: number;
  objectUrl: string;
  downloadUrl?: string;
  displayName: string;
};

// 결과물 확장자. 파일명·File 생성에 공통으로 쓴다.
export const FOURCUT_OUTPUT_EXTENSION = "png";

/**
 * 서버가 받아 주는 파일명 길이 상한.
 *
 * 근거는 로컬 `/v3/api-docs` 의 `DisplayNameUpdateRequest.displayName` maxLength 255
 * (2026-09-07 확인). 넘겨 보내면 400 이 오고 사유가 영문이라 안내가
 * 「잠시 후 다시 시도해 주세요」로 뭉개진다 — 기다려도 풀리지 않는 실패다.
 *
 * 입력창에도 같은 상한이 걸려 있지만(components/frame/GeneratedAssetDownloadCard.tsx),
 * **화면이 유일한 입구가 아니다.** 비회원 인계 보관물의 이름은 저장소에서 그대로 읽혀
 * `saveFourcutToServer` 로 곧장 들어오고(components/guest/GuestTrialBridge.tsx),
 * 그 보관물을 검사하는 곳은 길이를 보지 않는다(lib/pendingGuestSave.ts 의 `normalizeMeta`).
 * 그래서 다듬는 단계에서도 자른다.
 *
 * 화면과 이 파일이 같은 숫자를 보도록 값은 여기서 내보낸다.
 */
export const DISPLAY_NAME_MAX_LENGTH = 255;

/**
 * 상한까지 자르고 잘린 끝을 다듬는다. 상한 안이면 손대지 않는다.
 *
 * 자르기는 **다듬기가 끝난 뒤**여야 한다. 공백을 줄이기 전에 자르면 곧 사라질 공백이
 * 자리를 차지해 멀쩡한 글자가 대신 잘려 나간다.
 *
 * 자른 자리는 한 번 더 훑는다. 앞 규칙이 걷어낸 것이 자르면서 되살아나기 때문이다 —
 * 문장 중간의 공백이 끝의 공백이 되고, 이어지던 점이 끝의 점이 된다.
 *
 * 길이는 UTF-16 코드 단위로 센다. 서버(Java `String.length()`)도 입력창의 `maxLength` 도
 * 같은 단위라 세 곳의 판정이 어긋나지 않는다. 다만 그 경계가 이모지 한 글자의 한가운데일
 * 수 있어 짝을 잃은 앞쪽 반은 버린다 — 남기면 이름 끝에 깨진 글자가 붙는다.
 */
function clampDisplayName(value: string) {
  if (value.length <= DISPLAY_NAME_MAX_LENGTH) return value;

  let cut = value.slice(0, DISPLAY_NAME_MAX_LENGTH);
  const lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut = cut.slice(0, -1);

  return cut.replace(/[\s.]+$/g, "");
}

export function sanitizeDisplayName(input: string, fallback: string) {
  const normalized = clampDisplayName(
    input
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/\.+$/g, ""),
  );

  // 폴백도 그대로 서버로 나가므로 같은 상한을 건다.
  return normalized || clampDisplayName(fallback);
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// 기본 파일명은 생성 시각만 쓴다(harucut_YYYYMMDD_HHMMSS).
export function buildDefaultDisplayName() {
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
