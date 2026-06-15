import { NextResponse } from "next/server";
import { forward } from "@/app/api/client/_proxy";
import { adaptSetCookiesForRequest } from "@/lib/server/setCookies";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const hasAuthCookie =
    cookieHeader.includes("accessToken=") ||
    cookieHeader.includes("refreshToken=");

  // 쿠키 자체가 없으면 바로 미인증
  if (!hasAuthCookie) {
    return NextResponse.json({ authenticated: false });
  }

  // 쿠키가 남아있어도 만료/무효일 수 있으므로 백엔드로 실제 유효성을 검증한다.
  // (쿠키 존재만으로 인증으로 판단하면 만료된 세션이 /login에서 /home으로 튕긴다)
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
