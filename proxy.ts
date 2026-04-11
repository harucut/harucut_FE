import { NextRequest, NextResponse } from "next/server";
import { isProtectedPath } from "@/lib/protectedPaths";

function hasAuthCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("accessToken")?.value ||
      req.cookies.get("refreshToken")?.value,
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasAuthCookie(req)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirectTo", redirectTarget);
  return NextResponse.redirect(loginUrl);
}

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
