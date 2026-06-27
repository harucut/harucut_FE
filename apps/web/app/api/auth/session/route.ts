import { NextResponse } from "next/server";
import { forward } from "@/app/api/client/_proxy";
import { adaptSetCookiesForRequest } from "@/lib/server/setCookies";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  // 세션 인증 여부는 프론트에서 쿠키 존재를 직접 판단하지 않고 백엔드(/api/auth/status)에
  // 위임한다. 쿠키가 남아있어도 만료/무효일 수 있으므로, 실제 유효성만 신뢰한다.
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/status`,
    forwardBody: false,
  });

  const res = NextResponse.json({ authenticated: upstream.ok });
  // 백엔드가 토큰을 갱신했다면 set-cookie를 그대로 전달
  for (const cookie of adaptSetCookiesForRequest(upstream.setCookies, req)) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
