import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import {
  EVENT_ENTRY_QUERY,
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
} from "@/lib/guestTrialShared";
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

// 로그인 없이 체험할 수 있는 보호 경로 — 촬영까지다.
//
// 비회원에게 여는 범위는 "찍고 그 사진을 받는 것"까지다. 기록 보관과 프레임 제작은 가입 후다.
// 다운로드를 남긴 이유는 행사(Enterprise) 참가자 때문이다 — QR로 들어온 참가자는 아래
// isEventEntry 로 같은 게스트 자격을 받는데, 다운로드까지 막으면 "참가자는 가입 없이 찍고
// 그 자리에서 가져가요"라는 판매 문구가 사실이 아니게 된다.
const GUEST_ALLOWED_PREFIXES = ["/shoot"] as const;

function isGuestAllowedPath(pathname: string) {
  return GUEST_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * 행사장 QR 진입인지 본다.
 *
 * QR을 찍은 참가자는 쿠키가 하나도 없는 새 브라우저로 `/shoot?frame=...&event=...` 에
 * 도착한다. 이 검사가 없으면 프록시가 먼저 /login 으로 돌려보내서, "가입 없이 바로 찍는다"는
 * 행사 흐름이 정작 행사장에서만 동작하지 않는다.
 *
 * 촬영 진입점(`/shoot`)에만 적용한다 — QR이 가리키는 주소가 거기이고, 하위 단계는
 * 이 진입에서 심긴 쿠키로 이어진다.
 */
function isEventEntry(pathname: string, params: URLSearchParams) {
  return pathname === "/shoot" && Boolean(params.get(EVENT_ENTRY_QUERY)?.trim());
}

/**
 * 비회원 체험 쿠키를 심는다. 클라이언트(guestTrialStore)가 심는 것과 같은 속성이어야
 * 한쪽이 심고 다른 쪽이 못 읽는 일이 없다.
 */
function startGuestTrial(response: NextResponse, secure: boolean) {
  response.cookies.set(GUEST_TRIAL_COOKIE, "1", {
    path: "/",
    maxAge: GUEST_TRIAL_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure,
  });
  return response;
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

  // 행사 QR은 "가입 없이 체험하기"를 누른 것과 같은 자격이다 — 랜딩 버튼으로 누구나 얻을 수
  // 있는 것과 같은 권한이므로 새로 여는 문이 아니다. 대신 행사 참가자는 그 버튼을 누를
  // 기회 자체가 없으므로 여기서 대신 시작시킨다.
  if (isEventEntry(pathname, req.nextUrl.searchParams)) {
    return startGuestTrial(
      NextResponse.next(),
      req.nextUrl.protocol === "https:",
    );
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirectTo", redirectTarget);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/home/:path*",
    "/shoot/:path*",
    "/history/:path*",
    "/theme/:path*",
    "/mypage",
  ],
};
