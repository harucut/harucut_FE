import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = [
  "/home",
  "/shoot",
  "/upload",
  "/history",
  "/theme",
  "/mypage",
];

function hasAuthCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("accessToken")?.value ||
      req.cookies.get("refreshToken")?.value,
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;

  const isProtected = PROTECTED_PATHS.some((path) => pathname.startsWith(path));
  if (!isProtected) {
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
