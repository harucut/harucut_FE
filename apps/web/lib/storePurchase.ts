"use client";

import {
  STORE_PRODUCT_IDS,
  storeConflictSource,
  storePlatformOf,
  subscriptionManageHint,
  type StorePlatform,
} from "@harucut/shared";
import type { ApiEnvelope, Subscription } from "@/lib/api-types";
import { getApiErrorDetails, getUserFacingApiErrorMessage } from "@/lib/apiError";
import { requireData } from "@/lib/apiEnvelope";
import { clientApi } from "@/lib/clientApi";
import {
  getNativeShell,
  nativeStoreFinish,
  nativeStorePurchase,
  nativeStoreRestore,
  supportsStorePurchase,
  type StoreProof,
} from "@/lib/nativeBridge";
import { getMySubscription } from "@/lib/userApi";

/**
 * 앱 구독 구매·복원(P4-B, R5 12절). 셸이 스토어에서 받은 증빙을 서버에 제출하고, 서버가 받아들이면 셸이 거래를 마친다.
 * 제출이 실패하면 거래를 마치지 않는다 — 스토어가 다시 보내고 「구매 복원」이 다시 제출한다.
 * 흐름 전체는 packages/shared/src/store-purchase.ts 머리말.
 */

export async function submitStorePurchase(platform: StorePlatform, productId: string, proof: string) {
  const res = await clientApi.post<ApiEnvelope<Subscription>>("/api/client/subscriptions/store-purchases", {
    platform,
    productId,
    proof,
  });
  return requireData(res.data, "구독");
}

export async function restoreStorePurchases(platform: StorePlatform, items: StoreProof[]) {
  const res = await clientApi.post<ApiEnvelope<Subscription>>("/api/client/subscriptions/store-purchases/restore", {
    platform,
    items: items.map(({ productId, proof }) => ({ productId, proof })),
  });
  return requireData(res.data, "구독");
}

export type StoreFlowResult =
  | { kind: "done"; subscription: Subscription }
  /** 사용자가 결제 창을 닫았다 — 아무 안내도 하지 않는다. */
  | { kind: "cancelled" }
  /** 셸 밖이거나 구버전 셸 — 업데이트를 안내한다(웹 결제로 우회하지 않는다). */
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** 서버 거절 문구. 다른 출처로 구독 중(SUBS-009)이면 어디서 관리하는지 붙인다. */
export function storeErrorMessage(cause: unknown, fallback: string) {
  const base = getUserFacingApiErrorMessage(cause, fallback);
  if (getApiErrorDetails(cause).code !== "SUBS-009") return base;
  const hint = subscriptionManageHint(storeConflictSource(cause));
  return hint ? `${base} ${hint}` : base;
}

/** 플러스를 스토어로 산다. */
export async function buyPlusInApp(): Promise<StoreFlowResult> {
  const shell = getNativeShell();
  if (!shell || !supportsStorePurchase()) return { kind: "unsupported" };
  let accountToken: string | undefined;
  try {
    accountToken = (await getMySubscription())?.storeAccountToken;
  } catch (cause) {
    return { kind: "error", message: getUserFacingApiErrorMessage(cause, "구독 정보를 불러오지 못했어요.") };
  }
  if (!accountToken) return { kind: "error", message: "구독 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." };

  const productId = STORE_PRODUCT_IDS.plus;
  const purchase = await nativeStorePurchase(productId, accountToken);
  if (!purchase) return { kind: "unsupported" };
  if (!purchase.ok) return purchase.message ? { kind: "error", message: purchase.message } : { kind: "cancelled" };

  try {
    const subscription = await submitStorePurchase(storePlatformOf(shell.platform), productId, purchase.value.proof);
    await nativeStoreFinish([purchase.value.proof]);
    return { kind: "done", subscription };
  } catch (cause) {
    return {
      kind: "error",
      message: storeErrorMessage(cause, "구매는 됐지만 아직 반영하지 못했어요. 「구매 복원」을 눌러 다시 시도해 주세요."),
    };
  }
}

/** 이 기기 스토어 계정의 구독을 이 계정에 다시 잇는다. */
export async function restoreInApp(): Promise<StoreFlowResult> {
  const shell = getNativeShell();
  if (!shell || !supportsStorePurchase()) return { kind: "unsupported" };
  const restored = await nativeStoreRestore();
  if (!restored) return { kind: "unsupported" };
  if (!restored.ok) return restored.message ? { kind: "error", message: restored.message } : { kind: "cancelled" };
  // 서버는 한 번에 20개까지 받는다. 우리가 파는 상품만 보낸다.
  const items = restored.value
    .filter((item) => (Object.values(STORE_PRODUCT_IDS) as string[]).includes(item.productId))
    .slice(0, 20);
  if (items.length === 0) return { kind: "error", message: "이 스토어 계정에 복원할 구독이 없어요." };

  try {
    const subscription = await restoreStorePurchases(storePlatformOf(shell.platform), items);
    await nativeStoreFinish(items.map((item) => item.proof));
    return { kind: "done", subscription };
  } catch (cause) {
    return { kind: "error", message: storeErrorMessage(cause, "구독을 복원하지 못했어요. 잠시 뒤 다시 시도해 주세요.") };
  }
}
