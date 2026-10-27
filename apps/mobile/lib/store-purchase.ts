import * as IAP from 'expo-iap';

import type { BridgeResult } from '@/lib/native-bridge';

/**
 * 앱 구독 구매·복원(P4-B, R5 12절). 스토어(StoreKit·Play Billing)는 셸만 부를 수 있어 브리지로 맡는다.
 * 흐름과 규칙은 packages/shared/src/store-purchase.ts 머리말 — 여기서는 기기 기능만 붙인다.
 *
 * 서버 검증이 끝나기 전에는 거래를 마치지 않는다(iap-finish 가 따로 온다). 마치지 않은 거래는 스토어가 다시 보내므로
 * 웹이 제출에 실패해도 구매를 잃지 않는다 — 「구매 복원」이 다시 제출한다.
 * **실기기·스토어 상품으로는 확인하지 못했다** — 콘솔 상품·sandbox 테스터가 있어야 한다.
 */

const UNAVAILABLE = '스토어에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

let connection: Promise<boolean> | null = null;

function connect() {
  connection ??= IAP.initConnection()
    .then(() => true)
    .catch(() => {
      connection = null;
      return false;
    });
  return connection;
}

/** 서버 검증을 기다리는 거래. 증빙(purchaseToken)으로 찾는다. */
const unfinished = new Map<string, IAP.Purchase>();

/** data: [{ productId, displayPrice, title }] — 스토어가 모르는 id 는 빠진다. */
export async function storeProducts(productIds: string[]): Promise<BridgeResult> {
  if (!(await connect())) return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  try {
    const products = ((await IAP.fetchProducts({ skus: productIds, type: 'subs' })) ?? []) as IAP.ProductSubscription[];
    return {
      ok: true,
      data: products.map((p) => ({ productId: p.id, displayPrice: p.displayPrice, title: p.title })),
    };
  } catch {
    return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  }
}

/**
 * 구독을 산다. accountToken(서버가 계정마다 주는 UUID)을 애플 appAccountToken·구글 obfuscatedAccountId 로 싣는다 —
 * 서버가 이 구매가 어느 계정 것인지 가린다. data: { productId, proof }.
 */
export async function purchaseSubscription(productId: string, accountToken: string): Promise<BridgeResult> {
  if (!(await connect())) return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  let offerToken: string | null | undefined;
  try {
    const [product] = ((await IAP.fetchProducts({ skus: [productId], type: 'subs' })) ?? []) as IAP.ProductSubscription[];
    if (!product) return { ok: false, reason: '지금은 구매할 수 없는 상품이에요.', code: 'store-unavailable' };
    // 안드로이드 구독은 기본 요금제의 offer 토큰이 있어야 결제 창이 열린다.
    if (product.platform === 'android') offerToken = product.subscriptionOffers[0]?.offerTokenAndroid;
  } catch {
    return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (result: BridgeResult) => {
      if (settled) return;
      settled = true;
      updated.remove();
      failed.remove();
      resolve(result);
    };
    const updated = IAP.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== productId || !purchase.purchaseToken) return;
      if (purchase.purchaseState === 'pending') {
        done({ ok: false, reason: '결제 승인을 기다리고 있어요. 승인되면 「구매 복원」을 눌러 주세요.', code: 'store-unavailable' });
        return;
      }
      unfinished.set(purchase.purchaseToken, purchase);
      done({ ok: true, data: { productId, proof: purchase.purchaseToken } });
    });
    const failed = IAP.purchaseErrorListener((error) => {
      if (error.productId && error.productId !== productId) return;
      done(
        error.code === IAP.ErrorCode.UserCancelled
          ? { ok: false, code: 'purchase-cancelled' }
          : { ok: false, reason: '구매를 마치지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'store-unavailable' },
      );
    });
    IAP.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku: productId, appAccountToken: accountToken },
        google: {
          skus: [productId],
          obfuscatedAccountId: accountToken,
          subscriptionOffers: offerToken ? [{ sku: productId, offerToken }] : undefined,
        },
      },
    }).catch(() => done({ ok: false, reason: UNAVAILABLE, code: 'store-unavailable' }));
  });
}

/** 이 기기 스토어 계정의 활성 구매를 모은다. data: [{ productId, proof }]. */
export async function restoreSubscriptions(): Promise<BridgeResult> {
  if (!(await connect())) return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  try {
    const purchases = (await IAP.getAvailablePurchases()) ?? [];
    const items = [];
    for (const purchase of purchases) {
      if (!purchase.purchaseToken || purchase.purchaseState === 'pending') continue;
      unfinished.set(purchase.purchaseToken, purchase);
      items.push({ productId: purchase.productId, proof: purchase.purchaseToken });
    }
    return { ok: true, data: items };
  } catch {
    return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  }
}

/** 서버가 받아들인 거래를 마친다. 모르는 증빙은 스토어에 다시 물어 찾는다. */
export async function finishPurchases(proofs: string[]): Promise<BridgeResult> {
  if (!(await connect())) return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  try {
    let available: IAP.Purchase[] | null = null;
    for (const proof of proofs) {
      let purchase = unfinished.get(proof);
      if (!purchase) {
        available ??= (await IAP.getAvailablePurchases()) ?? [];
        purchase = available.find((p) => p.purchaseToken === proof);
      }
      if (!purchase) continue;
      await IAP.finishTransaction({ purchase, isConsumable: false });
      unfinished.delete(proof);
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: UNAVAILABLE, code: 'store-unavailable' };
  }
}
