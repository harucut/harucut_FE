"use client";

import type { TermsAgreementItem } from "@/lib/termsApi";
import { isFreshSavedAt } from "@/lib/pendingStorageTtl";

/**
 * 가입 화면에서 받은 동의를 **로그인할 때까지** 들고 있는 자리.
 *
 * 왜 필요한가 — 동의를 기록하는 `POST /api/auth/terms/consents` 는 인증이 필요한데,
 * 우리 가입은 계정만 만들고 로그인시키지 않는다(가입 후 로그인 화면으로 보낸다).
 * 그래서 "동의를 받은 시점"과 "동의를 보낼 수 있는 시점" 사이에 화면 전환이 하나 낀다.
 *
 * 소셜 가입은 전체 페이지 리다이렉트라 메모리로는 유실된다. 그래서 localStorage 다.
 *
 * 여기 담기는 건 **사용자가 고른 값과 그것을 고른 계정(가입 이메일)**이다. 이메일이 같이
 * 들어가는 이유는 하나다 — 이 보관물은 가입한 그 계정에만 붙어야 한다. 코드만 담아 두면
 * 다음에 이 기기에서 로그인한 아무 계정에나 붙고, 동의 이력은 수정·삭제되지 않아
 * 고른 적 없는 사람의 법적 기록이 된다(특히 선택 약관의 마케팅 수신 동의·철회).
 */
const KEY = "harucut:pending-terms-consent:v1";

/**
 * 유효 기간. 가입하고 하루 안에 로그인하지 않으면 버린다.
 *
 * 계정 대조(`isSameConsentAccount`)가 1차 방어고, 이건 그 뒤를 받친다 — 공용 기기에서
 * 같은 계정으로 다시 로그인하더라도, 언제 고른 것인지 모르는 선택을 그대로 장부에
 * 올리지는 않는다.
 */
export const PENDING_TERMS_CONSENT_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingTermsConsent = {
  items: TermsAgreementItem[];
  /** 이 동의를 고른 계정. 로그인한 계정과 다르면 보내지 않는다. */
  email: string;
};

type StoredConsent = PendingTermsConsent & { savedAt: number };

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 보관물이 이 계정 것인지. 대소문자·앞뒤 공백 차이는 같은 계정으로 본다 —
 * 가입 폼에 친 문자열과 서버가 돌려주는 이메일의 표기가 늘 같지는 않다.
 */
export function isSameConsentAccount(a: string, b: string): boolean {
  const left = normalizeEmail(a);
  return left.length > 0 && left === normalizeEmail(b);
}

function isValidItem(value: unknown): value is TermsAgreementItem {
  if (!value || typeof value !== "object") return false;
  const item = value as TermsAgreementItem;
  return (
    typeof item.code === "string" &&
    item.code.trim().length > 0 &&
    typeof item.agreed === "boolean"
  );
}

/** 보관한다. 실패해도 가입을 막지 않는다 — 재동의 화면이 뒷받침한다. */
export function setPendingTermsConsent(
  items: TermsAgreementItem[],
  email: string,
  now: number = Date.now(),
): boolean {
  if (typeof window === "undefined") return false;
  if (items.length === 0) return false;
  // 주인 없는 보관물은 남기지 않는다. 대조할 것이 없으면 아무 계정에나 붙기 때문에,
  // 기록을 놓치는 쪽이 남의 계정에 잘못 붙이는 쪽보다 낫다.
  const owner = normalizeEmail(email);
  if (owner.length === 0) return false;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ items, email: owner, savedAt: now }),
    );
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * 꺼낸다. 모양이 깨졌거나 기한이 지났으면 그 자리에서 지우고 null 을 준다 —
 * 남겨 두면 로그인할 때마다 같은 실패를 반복한다.
 */
export function getPendingTermsConsent(
  now: number = Date.now(),
): PendingTermsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredConsent;
    if (!Array.isArray(parsed?.items) || parsed.items.length === 0) {
      clearPendingTermsConsent();
      return null;
    }
    if (!parsed.items.every(isValidItem)) {
      clearPendingTermsConsent();
      return null;
    }
    // 주인을 모르는 보관물은 대조할 수가 없다. 모양이 깨진 것과 똑같이 버린다.
    if (
      typeof parsed.email !== "string" ||
      normalizeEmail(parsed.email).length === 0
    ) {
      clearPendingTermsConsent();
      return null;
    }
    /*
      기한 판정의 소유자는 `lib/pendingStorageTtl.ts` 다 — 게스트 인계 보관물과 같이 쓴다.

      여기 값은 **법적 동의 이력**으로 서버에 올라간다(`TermsConsentBridge`). 성한 숫자가
      아니면 기한을 셀 수 없는데, 예전처럼 그냥 통과시키면 하루가 한참 지난 선택 약관까지
      다음 사람의 동의로 제출된다. 그래서 게스트 사진보다 더 엄하게 볼 이유는 있어도
      느슨하게 볼 이유는 없다.
    */
    if (!isFreshSavedAt(parsed.savedAt, now, PENDING_TERMS_CONSENT_TTL_MS)) {
      clearPendingTermsConsent();
      return null;
    }

    return { items: parsed.items, email: parsed.email };
  } catch {
    clearPendingTermsConsent();
    return null;
  }
}

export function clearPendingTermsConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}

/**
 * 같은 보관물인가 — **계정과 고른 값이 모두 같을 때만** 그렇다.
 *
 * 다른 탭이 새로 쓴 값은 거의 언제나 다른 계정 것이다(같은 이메일로 두 번 가입할 수 없다).
 * 그래도 항목까지 보는 이유는, 계정만 보면 "같은 계정의 다른 선택"을 내 것으로 오인하기
 * 때문이다. 순서까지 그대로여야 같은 것으로 본다 — 우리가 쓰는 쪽은 늘 같은 순서로 담는다.
 */
function isSameArchive(
  stored: StoredConsent,
  expected: PendingTermsConsent,
): boolean {
  if (!stored || typeof stored !== "object") return false;
  if (typeof stored.email !== "string") return false;
  if (!isSameConsentAccount(stored.email, expected.email)) return false;
  if (!Array.isArray(stored.items)) return false;
  if (stored.items.length !== expected.items.length) return false;
  return stored.items.every((item, index) => {
    const mine = expected.items[index];
    return (
      Boolean(item) && item.code === mine?.code && item.agreed === mine?.agreed
    );
  });
}

/**
 * **처음 읽었던 그 보관물일 때만** 지운다. 지웠으면 true.
 *
 * 이 키는 같은 origin 의 모든 탭이 함께 쓴다. 어떤 화면이 보관물을 읽고 한참 뒤에 지우는
 * 동안 다른 탭에서 새 가입이 끝나면, 그 사이 여기 값은 **다른 사람의 아직 제출되지 않은
 * 동의**로 바뀌어 있다. 그걸 무조건 지우면 그 사람이 고른 법적 동의가 소리 없이 사라지고,
 * 동의 이력은 나중에 만들어 넣을 수 없다.
 *
 * **원자적이지 않다.** localStorage 에는 조건부 삭제가 없어서 읽기와 삭제 사이는 여전히
 * 열려 있다. 이 함수가 하는 일은 그 창을 **화면이 열려 있는 내내에서 바로 아래 두 줄
 * 사이로 줄이는 것**뿐이다 — 그 틈에 다른 탭이 쓰면 그 값은 여전히 지워진다.
 */
export function clearPendingTermsConsentIfUnchanged(
  expected: PendingTermsConsent,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    if (!isSameArchive(JSON.parse(raw) as StoredConsent, expected)) return false;
    window.localStorage.removeItem(KEY);
    return true;
  } catch {
    // 읽지도 못하는 값이면 내 것인지 알 수 없다. 모르면 손대지 않는다 —
    // 모양이 깨진 보관물은 다음 회차에 `getPendingTermsConsent` 가 버린다.
    return false;
  }
}
