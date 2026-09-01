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
