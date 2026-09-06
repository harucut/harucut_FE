import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import {
  EVENT_ENTRY_QUERY,
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
} from "@/lib/guestTrialShared";
import { isGuestAllowedPath, isProtectedPath } from "@/lib/protectedPaths";

/** 소셜 로그인 콜백 경로. 아래 matcher 와 같은 값을 쓴다. */
const SOCIAL_LOGIN_CALLBACK = "/oauth2/callback";

function hasAuthCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("accessToken")?.value ||
      req.cookies.get("refreshToken")?.value,
  );
}

function hasGuestTrialCookie(req: NextRequest) {
  return req.cookies.get(GUEST_TRIAL_COOKIE)?.value === "1";
}

/**
 * 소셜 로그인 콜백에 도착했는가.
 *
 * 백엔드는 소셜 인가를 마치면 인증 쿠키를 심은 뒤 이 주소로 돌려보낸다
 * (docs/mobile-shell.md 「소셜 로그인 — 지금 흐름」). 즉 여기가 방문자가
 * "지금부터 회원"이 되는 자리다.
 */
function isSocialLoginCallback(pathname: string) {
  return pathname === SOCIAL_LOGIN_CALLBACK;
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

  /*
    체험 쿠키는 **로그인이 끝나는 자리에서** 걷는다.

    콜백 페이지는 성공하면 `window.location.href` 로 문서를 새로 받아 zustand 에 남은
    게스트 상태를 비우지만(app/oauth2/callback/page.tsx 머리말), 쿠키는 문서를 새로 받아도
    살아남는다. 그대로 두면 체험하다 가입한 사람이 로그인을 마친 뒤에도 계속 비회원으로
    읽혀(lib/guestTrialStore.ts 의 hydrateGuestMode) 자기 프레임과 기록을 못 본다.
    이메일 로그인은 같은 일을 app/login/page.tsx 의 exitGuestMode() 가 한다.

    인증 쿠키가 함께 있을 때만 걷는다 — 인가에 실패해 빈손으로 돌아온 사람에게서
    체험까지 뺏을 이유는 없다.
  */
  if (isSocialLoginCallback(pathname)) {
    const response = NextResponse.next();
    if (guestMode && hasAuthCookie(req)) {
      response.cookies.delete(GUEST_TRIAL_COOKIE);
    }
    return response;
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  /*
    인증 쿠키가 있으면 통과시킨다. **여기서 게스트 쿠키를 지우지는 않는다.**

    이 판정은 쿠키가 있는지만 본다 — 서버가 이미 버린 죽은 토큰도 로그인으로 읽힌다
    (다른 기기에서 로그인하면 이 기기 refresh 가 죽는다: docs/backend-contract.md).
    그 상태에서 지우면, 죽은 쿠키를 든 방문자가 "가입 없이 찍어보기"로 방금 심은 게스트
    쿠키를 바로 다음 요청에서 우리가 도로 지운다. 그 화면은 메모리 값으로 버티지만
    새로고침 한 번이면 hydrateGuestMode 가 쿠키를 못 찾아 회원으로 되돌아가고,
    촬영 화면이 인증 API 로 401 을 받아 "로그인이 풀렸어요"로 끝난다 — 몇 번을 눌러도
    체험이 시작되지 않는다.
  */
  if (hasAuthCookie(req)) {
    return NextResponse.next();
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
    // 보호 경로는 아니지만 로그인이 끝나는 자리라, 게스트 쿠키를 걷으러 들어간다.
    // matcher 는 Next 가 빌드 때 읽으므로 문자열을 그대로 적는다 —
    // 위 SOCIAL_LOGIN_CALLBACK 과 같은 값이어야 한다(proxy.test.ts 가 확인한다).
    "/oauth2/callback",
  ],
};
