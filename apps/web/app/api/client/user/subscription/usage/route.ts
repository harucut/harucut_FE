import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 구독 사용량 조회 프록시 (프레임 보관 한도·사용량) */
export async function GET(req: Request) {
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/subscription/usage`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
