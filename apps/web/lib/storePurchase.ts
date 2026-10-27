"use client";

import {
  STORE_PRODUCT_IDS,
  STORE_PURCHASES_ENABLED,
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
  /** finishPending: 서버엔 반영됐지만 스토어 거래를 아직 마치지 못했다 — 앱을 다시 열면 이어서 마친다. */
  | { kind: "done"; subscription: Subscription; finishPending?: boolean }
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
    const finished = await nativeStoreFinish([purchase.value.proof]);
    return { kind: "done", subscription, finishPending: !finished };
  } catch (cause) {
    return {
      kind: "error",
      message: storeErrorMessage(cause, "구매는 됐지만 아직 반영하지 못했어요. 「구매 복원」을 눌러 다시 시도해 주세요."),
    };
  }
}

/**
 * 이 기기 스토어 계정의 구독을 이 계정에 다시 잇는다. sync 는 사용자가 「구매 복원」을 눌렀을 때만 —
 * 스토어와 먼저 동기화해 로컬에 빠진 거래도 찾는다(인증 창이 뜰 수 있어 자동 재시도는 false).
 */
export async function restoreInApp({ sync = false }: { sync?: boolean } = {}): Promise<StoreFlowResult> {
  const shell = getNativeShell();
  if (!shell || !supportsStorePurchase()) return { kind: "unsupported" };
  const restored = await nativeStoreRestore({ sync });
  if (!restored) return { kind: "unsupported" };
  if (!restored.ok) return restored.message ? { kind: "error", message: restored.message } : { kind: "cancelled" };
  // 서버는 한 번에 20개까지 받는다. 우리가 파는 상품만 보낸다.
  const items = restored.value
    .filter((item) => (Object.values(STORE_PRODUCT_IDS) as string[]).includes(item.productId))
    .slice(0, 20);
  if (items.length === 0) return { kind: "error", message: "이 스토어 계정에 복원할 구독이 없어요." };

  try {
    const subscription = await restoreStorePurchases(storePlatformOf(shell.platform), items);
    const finished = await nativeStoreFinish(items.map((item) => item.proof));
    return { kind: "done", subscription, finishPending: !finished };
  } catch (cause) {
    return { kind: "error", message: storeErrorMessage(cause, "구독을 복원하지 못했어요. 잠시 뒤 다시 시도해 주세요.") };
  }
}

let resumed = false;

/**
 * 마치지 못한 스토어 거래를 앱이 열릴 때 조용히 이어서 마친다(Codex #566). 거래 마무리가 실패했거나 결제 창이 닫힌 뒤
 * 제출 전에 앱이 끝났으면 거래가 미완료로 남는데, 스토어는 다시 보내도 듣는 쪽이 없고 안드로이드는 3일 뒤 환불한다.
 * 복원과 같은 길(서버 재제출은 멱등)로 제출하고 마친다. 화면에는 아무것도 띄우지 않는다. 한 페이지 수명에 한 번만.
 * 로그인한 화면에서만 부른다(components/layout/AppNav).
 */
export async function resumeUnfinishedPurchases() {
  if (resumed || !STORE_PURCHASES_ENABLED || !supportsStorePurchase()) return;
  resumed = true;
  try {
    await restoreInApp();
  } catch {
    // 조용히 넘긴다 — 다음에 앱을 열 때나 「구매 복원」이 다시 한다.
  }
}

/** 테스트용 — 한 번만 도는 표식을 지운다. */
export function resetResumeForTest() {
  resumed = false;
}
