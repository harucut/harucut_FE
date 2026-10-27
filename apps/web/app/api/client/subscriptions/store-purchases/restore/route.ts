import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 앱 구독 복원(P4-B) — 이 기기 스토어 계정의 구매를 이 계정에 다시 잇는다. 다른 계정에 묶인 구매는 옮기지 않는다(SUBS-008). */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/subscriptions/store-purchases/restore`,
  });
}
