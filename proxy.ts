import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/server/auth";
import {
  adaptSetCookiesForRequest,
  getSetCookieHeaders,
} from "@/lib/server/setCookies";

// 보호가 필요한 경로 목록
const PROTECTED_PATHS = [
  "/home",
  "/shoot",
  "/upload",
  "/history",
  "/theme",
  "/mypage",
];
// const PROTECTED_PATHS = ["/history"];
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 보호 경로 접근 시 토큰 검증/리이슈 후 통과시키는 미들웨어 헬퍼
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;

  // 보호 안 하는 경로면 패스
  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
  if (!isProtected) {
    return NextResponse.next();
  }

  // accessToken 읽기
  const accessToken = req.cookies.get("accessToken")?.value;

  // accessToken이 있고, 검증도 통과하면 바로 통과
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload) {
      return NextResponse.next();
    }
  }

  // refreshToken 읽기
  const refreshToken = req.cookies.get("refreshToken")?.value;

  // refreshToken도 없으면 바로 로그인으로
  if (!refreshToken) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirectTo", redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  // accessToken이 없거나
  // accessToken이 만료/무효
  try {
    const refreshRes = await fetch(`${BASE_URL}/api/harucut/reissue`, {
      method: "POST",
      headers: {
        cookie: req.headers.get("cookie") ?? `refreshToken=${refreshToken}`,
      },
      cache: "no-store",
    });

    if (refreshRes.ok) {
      const setCookies = adaptSetCookiesForRequest(
        getSetCookieHeaders(refreshRes.headers),
        req,
      );
      if (setCookies.length > 0) {
        await refreshRes.text();
        const res = NextResponse.next();
        for (const cookie of setCookies) {
          res.headers.append("set-cookie", cookie);
        }
        return res;
      }
    }
  } catch (e) {
    console.error("Error while refreshing token in middleware:", e);
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirectTo", redirectTarget);
  return NextResponse.redirect(loginUrl);
}

// 어떤 경로에 middleware를 적용할지
export const config = {
  matcher: [
    "/home/:path*",
    "/shoot/:path*",
    "/upload/:path*",
    "/history/:path*",
    "/theme/:path*",
    "/mypage",
  ],
};
