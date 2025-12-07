import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";

const PROTECTED_PATHS = ["/home", "/shoot", "/upload", "/history", "/theme"];
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type ReissueResponse = {
  code: string;
  status: number;
  message: string | null;
  data: {
    accessToken: string;
    refreshToken: string;
  };
};
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // accessToken이 없거나
  // accessToken이 만료/무효
  try {
    const refreshRes = await fetch(`${BASE_URL}api/recorday/reissue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Refresh-Token": refreshToken,
      },
      cache: "no-store",
    });

    if (refreshRes.ok) {
      const { data } = (await refreshRes.json()) as ReissueResponse;

      const newAccessToken = data.accessToken;
      const newRefreshToken = data.refreshToken;

      if (newAccessToken || newRefreshToken) {
        const res = NextResponse.next();

        if (newAccessToken) {
          res.cookies.set("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        }

        if (newRefreshToken) {
          res.cookies.set("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        }

        return res;
      }
    }
  } catch (e) {
    console.error("Error while refreshing token in middleware:", e);
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirectTo", pathname);
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
  ],
};
