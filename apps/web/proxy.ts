import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { isProtectedPath } from "@/lib/protectedPaths";

function hasAuthCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("accessToken")?.value ||
      req.cookies.get("refreshToken")?.value,
  );
}

function hasGuestTrialCookie(req: NextRequest) {
  return req.cookies.get(GUEST_TRIAL_COOKIE)?.value === "1";
}

// 로그인 없이 체험할 수 있는 보호 경로 — 촬영과 꾸미기까지 허용한다.
// 꾸미기 저장은 로그인 유도(pendingGuestSave)로 이어진다.
const GUEST_ALLOWED_PREFIXES = ["/shoot", "/decorate"] as const;

function isGuestAllowedPath(pathname: string) {
  return GUEST_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(req: NextRequest) {
  // 로컬 개발 우회(임시) — 켜져 있으면 보호 경로 판정 자체를 건너뛴다.
  if (DEV_AUTH_BYPASS) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;
  const guestMode = hasGuestTrialCookie(req);

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (hasAuthCookie(req)) {
    const response = NextResponse.next();
    if (guestMode) {
      response.cookies.delete(GUEST_TRIAL_COOKIE);
    }
    return response;
  }

  if (guestMode) {
    if (isGuestAllowedPath(pathname)) {
      return NextResponse.next();
    }

    const shootUrl = new URL("/shoot", req.url);
    shootUrl.searchParams.set("guestNotice", "restricted");
    return NextResponse.redirect(shootUrl);
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
    "/decorate/:path*",
    "/history/:path*",
    "/theme/:path*",
    "/mypage",
  ],
};
