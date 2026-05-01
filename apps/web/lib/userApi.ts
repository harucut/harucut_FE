"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserInfo } from "@/lib/api-types";

export type { UserInfo } from "@/lib/api-types";

export async function getMyUserInfo() {
  const res = await clientApi.get<ApiEnvelope<UserInfo>>("/api/client/user-info", {
    cache: "no-store",
  });

  return res.data.data;
}
