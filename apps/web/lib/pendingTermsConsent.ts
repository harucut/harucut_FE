"use client";

import type { TermsAgreementItem } from "@/lib/termsApi";

/**
 * 가입 화면에서 받은 동의를 **로그인할 때까지** 들고 있는 자리.
 *
 * 왜 필요한가 — 동의를 기록하는 `POST /api/auth/terms/consents` 는 인증이 필요한데,
 * 우리 가입은 계정만 만들고 로그인시키지 않는다(가입 후 로그인 화면으로 보낸다).
 * 그래서 "동의를 받은 시점"과 "동의를 보낼 수 있는 시점" 사이에 화면 전환이 하나 낀다.
 *
 * 소셜 가입은 전체 페이지 리다이렉트라 메모리로는 유실된다. 그래서 localStorage 다.
 *
 * 여기 담기는 건 **사용자가 고른 값**뿐이다. 실패하더라도 잃는 건 마케팅 수신 여부이고,
 * 필수 약관은 어차피 재동의 화면(TermsConsentBridge)이 다시 받는다.
 */
const KEY = "harucut:pending-terms-consent:v1";

/**
 * 유효 기간. 가입하고 하루 안에 로그인하지 않으면 버린다.
 *
 * 공용 기기에서 남의 동의 선택이 내 계정에 붙는 것을 막는다 — 코드만 보면 "누가 무엇에
 * 동의했는지"를 구분할 방법이 없기 때문에, 오래된 것은 쓰지 않는 편이 안전하다.
 */
export const PENDING_TERMS_CONSENT_TTL_MS = 24 * 60 * 60 * 1000;

type StoredConsent = {
  items: TermsAgreementItem[];
  savedAt: number;
};

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
  now: number = Date.now(),
): boolean {
  if (typeof window === "undefined") return false;
  if (items.length === 0) return false;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.setItem(KEY, JSON.stringify({ items, savedAt: now }));
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
): TermsAgreementItem[] | null {
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
    if (
      typeof parsed.savedAt === "number" &&
      now - parsed.savedAt > PENDING_TERMS_CONSENT_TTL_MS
    ) {
      clearPendingTermsConsent();
      return null;
    }

    return parsed.items;
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
