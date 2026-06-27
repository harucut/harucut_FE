"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, SubscriptionUsage, UserInfo } from "@/lib/api-types";

export type { UserInfo } from "@/lib/api-types";

export async function getMyUserInfo() {
  const res = await clientApi.get<ApiEnvelope<UserInfo>>("/api/client/user-info", {
    cache: "no-store",
  });

  return res.data.data;
}

/** 구독 사용량(프레임 보관 한도·사용량) 조회 */
export async function getSubscriptionUsage() {
  const res = await clientApi.get<ApiEnvelope<SubscriptionUsage>>(
    "/api/client/user/subscription/usage",
    { cache: "no-store" },
  );

  return res.data.data;
}
