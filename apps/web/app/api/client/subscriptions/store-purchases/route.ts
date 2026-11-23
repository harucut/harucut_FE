import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 앱 구독 제출(P4-B) — 스토어 증빙(iOS JWS·Android purchaseToken)을 서버가 검증해 구독을 연다.
 * 실패: SUBS-007 검증 실패, SUBS-008 다른 계정의 구매, SUBS-009 다른 출처로 구독 중(data.source), SUBS-010 모르는 상품.
 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/subscriptions/store-purchases`,
  });
}
