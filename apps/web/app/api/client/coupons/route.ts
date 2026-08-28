import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 내가 쓴 쿠폰 목록(적용 완료 + 예약분). */
export async function GET(req: Request) {
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/coupons`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
