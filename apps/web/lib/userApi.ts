"use client";

import { clientApi } from "@/lib/clientApi";
import type {
  ApiEnvelope,
  Subscription,
  SubscriptionUsage,
  UserInfo,
} from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

export type { UserInfo } from "@/lib/api-types";

export async function getMyUserInfo() {
  const res = await clientApi.get<ApiEnvelope<UserInfo>>("/api/client/user-info", {
    cache: "no-store",
  });

  return requireData(res.data, "내 정보");
}

/** 구독 사용량(프레임 보관 한도·사용량) 조회 */
export async function getSubscriptionUsage() {
  const res = await clientApi.get<ApiEnvelope<SubscriptionUsage>>(
    "/api/client/user/subscription/usage",
    { cache: "no-store" },
  );

  return requireData(res.data, "구독 사용량");
}

/**
 * 내 구독(결제 주기·자동갱신).
 *
 * 사용량 조회(`getSubscriptionUsage`)와 다른 것을 준다 — 저쪽은 프레임 보관 한도고
 * 이쪽은 언제까지 유료인지다. 구독 행이 없으면 서버가 404(SUBS-004)를 내는데,
 * 정상 가입 흐름에서는 생기지 않는다. 화면이 안 죽게 null 로 눕힌다.
 */
export async function getMySubscription(): Promise<Subscription | null> {
  const res = await clientApi.get<ApiEnvelope<Subscription>>(
    "/api/client/subscriptions",
    { cache: "no-store" },
  );
  return res.data.data ?? null;
}
