import { buildResponse, forward } from "@/app/api/client/_proxy";
export const runtime = "edge";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * access/refreshToken이 있으면 백엔드 user info로 프록시
 */
export async function GET(req: Request) {
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/info`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
