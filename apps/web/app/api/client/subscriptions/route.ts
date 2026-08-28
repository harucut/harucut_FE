import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 내 구독.
 *
 * 사용량(`/user/subscription/usage`)과 다른 것을 준다 — 이쪽은 결제 주기와 자동갱신 여부다.
 * 404(SUBS-004)는 구독 행 자체가 없는 경우로, 정상 가입 흐름에서는 생기지 않는다.
 */
export async function GET(req: Request) {
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/subscriptions`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
