/**
 * 앱 구독 구매·복원(P4-B, R5 12절). 개인 앱은 스토어 인앱 결제로 판다 — 웹 PG 로 우회하지 않는다.
 *
 * 흐름: 웹(가격표·마이페이지) → 브리지(`iap-*`) → 셸이 StoreKit·Play Billing 으로 구매 → 증빙(iOS JWS·Android
 * purchaseToken)을 웹이 서버에 제출(`POST /api/auth/subscriptions/store-purchases`) → 서버 검증 뒤 셸이 거래를 마친다
 * (`iap-finish`). 마치지 않은 거래는 스토어가 다시 보내고, 안드로이드는 3일 안에 확인하지 않으면 환불된다.
 *
 * 규칙은 여기 둔다 — 모바일에는 테스트 러너가 없어 웹 jest(apps/web/lib/storePurchase.test.ts)로 지킨다.
 */

/**
 * 앱 결제를 화면에 여는가. **사업 결정이다** — 스토어 상품·심사·가격이 준비되기 전에는 끈다(웹 결제 PAYMENTS_ENABLED 와 별개).
 * 꺼져 있으면 구매·복원 버튼을 그리지 않는다. 구독 출처 안내는 이 값과 상관없이 보인다.
 */
export const STORE_PURCHASES_ENABLED = false;

/** 구매·복원 메시지를 아는 셸의 브리지 판(apps/mobile/lib/native-bridge.ts 의 BRIDGE_VERSION). */
export const STORE_PURCHASE_SHELL_VERSION = 3;

export type StorePlatform = 'APP_STORE' | 'PLAY_STORE';

/** GET /api/auth/subscriptions 의 source. BASIC 이면 키가 없다. */
export type SubscriptionSource = 'WEB' | 'APP_STORE' | 'PLAY_STORE' | 'COUPON';

/**
 * 스토어 상품 id ↔ 등급. 백엔드 설정(harucut.plus.monthly 등)과 스토어 콘솔 상품 id 가 같아야 한다 — **실연동 미확인**.
 * 가격표에 카드가 있는 유료 등급(플러스)만 판다.
 */
export const STORE_PRODUCT_IDS = { plus: 'harucut.plus.monthly' } as const;

export function storePlatformOf(platform: 'ios' | 'android'): StorePlatform {
  return platform === 'ios' ? 'APP_STORE' : 'PLAY_STORE';
}

/** 구독을 어디서 관리하는지. 해지·변경은 결제한 곳에서만 된다(서버도 다른 출처의 해지를 SUBS-009 로 막는다). */
export function subscriptionManageHint(source: SubscriptionSource | null | undefined): string | null {
  switch (source) {
    case 'APP_STORE':
      return 'App Store 에서 구독 중이에요. 해지·변경은 iPhone 설정 > Apple 계정 > 구독에서 해요.';
    case 'PLAY_STORE':
      return 'Google Play 에서 구독 중이에요. 해지·변경은 Play 스토어 > 결제 및 정기 결제에서 해요.';
    case 'WEB':
      return '하루컷 웹에서 결제한 구독이에요.';
    case 'COUPON':
      return '쿠폰으로 받은 이용권이에요.';
    default:
      return null;
  }
}

/** 409 SUBS-009 의 data.source 로 「어디서 관리하나」를 붙인다. 모르는 값이면 null. */
export function storeConflictSource(error: unknown): SubscriptionSource | null {
  const source = (error as { data?: { data?: { source?: unknown } } })?.data?.data?.source;
  return source === 'WEB' || source === 'APP_STORE' || source === 'PLAY_STORE' || source === 'COUPON' ? source : null;
}
