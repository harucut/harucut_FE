"use client";

import { FRAME_LAYOUTS } from "@/constants/frameLayouts";
import type { FrameId } from "@/constants/frames";
import { newIdempotencyKey } from "@/lib/composeApi";
import type { FourcutFilterId } from "@/lib/frameFilters";

/**
 * 비회원이 만든 네컷을 로그인 뒤 기록으로 옮기기 위한 보관소.
 *
 * 예전에는 **완성된 PNG 한 장**을 담았다. 지금은 **원본 4장과 만드는 방법**을 담는다.
 *
 * 이유는 둘이다.
 *  1. 완성본을 서버에 등록하는 API 가 없어졌다(405). 지금 결과물을 남기는 유일한 길은
 *     원본 4장을 올려 서버가 그리게 하는 것이라, 보관해야 할 것도 그 재료다.
 *  2. 더 작다. 완성본은 2000×6000 PNG 라 base64 로 담으면 localStorage 한도(대개 5MB)에
 *     자주 걸렸다. 원본 4장은 촬영 해상도 JPEG 이라 합쳐도 그보다 작다.
 *
 * 덤으로 결과가 좋아진다 — 로그인 후 서버가 전체 해상도로 다시 그리므로,
 * 비회원 때 브라우저가 iOS 캔버스 상한에 맞춰 줄여 그린 그림보다 크다.
 *
 * OAuth 는 전체 페이지 리다이렉트라 메모리로는 유실된다. 그래서 localStorage 다.
 */
const KEY = "harucut:pending-guest-save:v2";
const LEGACY_KEY = "harucut:pending-guest-save:v1";

/**
 * 보관물의 유효 기간. 넘으면 없는 것으로 본다.
 *
 * 없으면 몇 주 전 사진이 오늘 기록으로 저장된다 — 사용자는 방금 찍은 것을 기대하는데
 * 남의 얼굴이 튀어나올 수도 있다(공용 기기). 하루면 "찍고 로그인"을 마치기에 넉넉하다.
 */
export const PENDING_GUEST_SAVE_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingGuestSave = {
  /** 고른 순서 그대로의 원본 4장(data URL). 이 순서가 곧 슬롯 순서다. */
  sources: string[];
  frameId: FrameId;
  remoteFrameId: number | null;
  outputFilter: FourcutFilterId;
  displayName: string;
  /**
   * 비회원이 고른 배경색(`#RRGGBB`).
   *
   * 비회원 결과물은 브라우저가 이 색으로 그린다. 이 값을 빼고 인계하면 로그인 후
   * 서버 합성이 색 없이 나가고, 서버는 **프레임에 저장된 배경**으로 그린다 —
   * 방금 내려받아 본 그림과 기록에 남는 그림의 배경색이 갈린다.
   *
   * 선택 필드다. 이 필드가 없던 시절의 보관물은 `undefined` 로 읽히고, 그때는
   * 색을 안 보내던 예전 동작 그대로 간다(키를 v3 로 올리면 그 보관물이 버려진다).
   */
  backgroundColor?: string;
  /**
   * 이 보관물을 인계할 때 쓰는 서버 합성 멱등키.
   *
   * 인계는 **한 번에 끝나지 않을 수 있다.** 서버 합성이 이미 성공한 뒤에도 폴링이 시간
   * 초과되거나 뒤따르는 조회가 실패할 수 있고, 그때 호출부는 다시 해 볼 만한 실패로 보고
   * 보관물을 남긴다(components/guest/GuestTrialBridge.tsx). 키가 없으면 다음 시도가 새
   * 키로 접수돼 **같은 네컷이 보관함에 한 벌 더** 생긴다. 같은 키를 다시 보내면 서버가
   * 이미 만든 작업을 그대로 재생한다.
   *
   * 값은 `ensurePendingGuestSaveComposeKey` 가 인계 직전에 심는다. 보관물과 수명을 같이
   * 하므로 다른 네컷에 새는 일이 없다 — 인계가 끝나면 보관물째 지워지고, 새로 찍은 네컷은
   * `setPendingGuestSave` 가 보관물을 통째로 갈아 끼운다.
   *
   * 배경색과 같은 선택 필드다. 이 필드가 없던 시절의 보관물은 `undefined` 로 읽히고,
   * 그때 처음 인계하며 키를 심는다(키를 v3 로 올리면 그 보관물이 버려진다).
   */
  composeIdempotencyKey?: string;
  savedAt: number;
};

/** 서버가 받는 배경색 형식. 어긋나면 400 이라 보내지 않는 편이 낫다. */
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** 서버가 받는 멱등키 길이 상한(lib/composeApi.ts). 넘으면 400 이라 없는 것으로 본다. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 64;

/**
 * 보관한다. 용량 초과 등으로 실패하면 false — 호출부가 "먼저 내려받으라"고 안내한다.
 * 예전 v1 키(완성본 PNG)가 남아 있으면 같이 걷어낸다.
 *
 * 쓰기가 실제로 남았는지 되읽어 확인한다. 일부 브라우저(사파리 사생활 보호 모드 등)는
 * `setItem` 이 조용히 아무것도 안 하고 예외도 안 던지는데, 그때 true 를 돌려주면
 * "로그인하면 기록에 저장된다"고 약속해 놓고 아무것도 남지 않는다.
 *
 * **멱등키는 밖에서 받지 않는다.** 보관물을 통째로 갈아 끼우므로 새 네컷은 항상 키 없이
 * 시작하고, 옛 키를 물려받아 서버가 앞사람 그림을 재생하는 일이 생기지 않는다.
 */
export function setPendingGuestSave(
  entry: Omit<PendingGuestSave, "savedAt" | "composeIdempotencyKey">,
  now: number,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    // 자리를 먼저 비워 둔다 — 옛 보관물이 남아 있으면 새 것이 한도에 걸릴 수 있다.
    window.localStorage.removeItem(KEY);
    window.localStorage.setItem(KEY, JSON.stringify({ ...entry, savedAt: now }));
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 꺼낸다. 쓸 수 없는 보관물(모양이 깨졌거나, 기한이 지났거나, 모르는 프레임)은
 * 그 자리에서 지우고 null 을 준다 — 남겨 두면 로그인할 때마다 같은 실패를 반복한다.
 */
export function getPendingGuestSave(
  now: number = Date.now(),
): PendingGuestSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PendingGuestSave;
    // 원본 4장이 온전할 때만 쓸모가 있다.
    if (!Array.isArray(parsed?.sources) || parsed.sources.length !== 4) {
      clearPendingGuestSave();
      return null;
    }
    if (parsed.sources.some((src) => typeof src !== "string" || !src)) {
      clearPendingGuestSave();
      return null;
    }
    // 모르는 프레임이면 레이아웃을 못 찾아 합성 직전에 TypeError 로 터진다.
    if (!parsed.frameId || !FRAME_LAYOUTS[parsed.frameId]) {
      clearPendingGuestSave();
      return null;
    }
    if (
      typeof parsed.savedAt === "number" &&
      now - parsed.savedAt > PENDING_GUEST_SAVE_TTL_MS
    ) {
      clearPendingGuestSave();
      return null;
    }

    // 색이 깨졌으면 없는 것으로 본다. 형식이 어긋난 값을 그대로 실어 보내면
    // 합성 요청이 400 으로 떨어져 보관물 전체를 잃는다.
    const backgroundColor =
      typeof parsed.backgroundColor === "string" &&
      HEX_COLOR_PATTERN.test(parsed.backgroundColor)
        ? parsed.backgroundColor
        : undefined;

    // 멱등키도 같은 이유로 검사한다. 빈 문자열이나 64자를 넘는 값을 실어 보내면 합성
    // 요청이 400 으로 떨어져 보관물 전체를 잃는다 — 그럴 바에는 새로 심는 편이 낫다.
    const composeIdempotencyKey =
      typeof parsed.composeIdempotencyKey === "string" &&
      parsed.composeIdempotencyKey.length > 0 &&
      parsed.composeIdempotencyKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH
        ? parsed.composeIdempotencyKey
        : undefined;

    return { ...parsed, backgroundColor, composeIdempotencyKey };
  } catch {
    clearPendingGuestSave();
    return null;
  }
}

/**
 * 이 보관물의 합성 멱등키를 돌려준다. 아직 없으면 그 자리에서 만들어 함께 보관한다.
 * 보관물이 없으면 null — 인계할 것이 없다는 뜻이다.
 *
 * 인계가 끝날 때까지 **같은 키**를 준다. 서버 합성이 성공한 뒤 폴링 시간 초과나 뒤따르는
 * 조회 실패로 인계가 중간에 끊기면 보관물이 남는데, 그때 새 키로 다시 접수하면 같은 네컷이
 * 보관함에 두 벌 남는다. 회원 쪽에서 세션이 키를 들고 있는 것과 같은 이유다
 * (`lib/shootSessionStore.ts` 의 `ensureComposeIdempotencyKey`) — 다만 여기서는 인계가
 * 전체 페이지 리다이렉트와 새로고침을 건너뛰므로 메모리로는 부족해 보관물에 함께 심는다.
 *
 * 되쓰기는 `setPendingGuestSave` 와 달리 **먼저 지우지 않는다.** 지운 뒤 쓰기가 용량 한도에
 * 걸리면 원본 4장까지 통째로 잃는다 — 키 한 줄 못 남기는 것보다 훨씬 나쁘다. 못 남겼으면
 * 이번 시도에만 쓰고 끝난다(예전 동작 그대로).
 */
export function ensurePendingGuestSaveComposeKey(
  now: number = Date.now(),
): string | null {
  const entry = getPendingGuestSave(now);
  if (!entry) return null;
  if (entry.composeIdempotencyKey) return entry.composeIdempotencyKey;

  const composeIdempotencyKey = newIdempotencyKey();
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...entry, composeIdempotencyKey }),
    );
  } catch {}

  return composeIdempotencyKey;
}

export function clearPendingGuestSave(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {}
}
