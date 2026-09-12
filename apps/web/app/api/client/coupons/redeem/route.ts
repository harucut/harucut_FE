import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 쿠폰 사용. 본문: { code }
 *
 * 200 이라고 지금 등급이 오른 것은 아니다 — 응답의 `applied` 가 false 면 현재 구독이
 * 끝난 뒤 시작하도록 **예약**된 것이고, 이것도 정상 성공이다(lib/couponApi.ts 참고).
 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/coupons/redeem`,
  });
}
