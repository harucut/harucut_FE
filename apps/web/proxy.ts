import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import {
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
  PUBLIC_SHOOT_ENTRY,
} from "@/lib/guestTrialShared";
import {
  isGuestAllowedPath,
  isGuestMemberOnlyPath,
  isProtectedPath,
} from "@/lib/protectedPaths";

/**
 * 게스트를 촬영 화면으로 되돌릴 주소. **고른 프레임을 들고 간다.**
 *
 * `/shoot` 은 쿼리도 `keepShots` 도 없는 진입을 **새 촬영**으로 보고 세션을 비운다
 * (app/shoot/page.tsx). 그래서 고정된 `/shoot?guestNotice=restricted` 로 보내면 방금 고른
 * 프레임이 사라진다 — 막는 것은 회원 전용 경로 하나지 촬영 전체가 아니다.
 *
 * 미들웨어는 세션을 못 보므로 **요청에 실려 온 것만** 옮길 수 있다. 그래서 프레임 선택
 * 화면이 갤러리 불러오기로 보낼 때 `frame` 을 주소에 싣는다(그 화면 주석 참고) —
 * 이 함수가 그것을 되돌릴 주소로 옮긴다. 실려 오지 않았으면 옮길 것도 없다.
 */
function restrictedShootUrl(req: NextRequest) {
  const url = new URL("/shoot", req.url);
  url.searchParams.set("guestNotice", "restricted");

  const frame = req.nextUrl.searchParams.get("frame")?.trim();
  if (frame) url.searchParams.set("frame", frame);

  return url;
}

/** 소셜 로그인 콜백 경로. 아래 matcher 와 같은 값을 쓴다. */
const SOCIAL_LOGIN_CALLBACK = "/oauth2/callback";

function hasAuthCookie(req: NextRequest) {
  return Boolean(
    req.cookies.get("accessToken")?.value ||
      req.cookies.get("refreshToken")?.value,
  );
}

/**
 * 아직 살아 있는 access 토큰을 들고 왔는가.
 *
 * 쿠키가 있는지만 보면 만료된 토큰도 로그인으로 읽힌다(아래 보호 경로 주석). access 는
 * JWT 라 `exp` 를 미들웨어에서 그 자리에서 읽을 수 있고, 백엔드는 access 를 어디에도
 * 저장하지 않고 exp 까지 그대로 받아 준다 — 회수할 수 있는 것은 refresh 뿐이다
 * (docs/backend-contract.md 「토큰」). 그래서 exp 가 남아 있다는 것이 "지금 회원"이라는 뜻이다.
 * refresh 는 다른 기기에서 로그인하면 서버가 지우므로 만료 전에도 죽어 있을 수 있어 보지 않는다.
 *
 * 서명은 검증하지 않는다 — 검증할 키가 미들웨어에 없고, 여기서 정하는 것은 인가가 아니라
 * 체험 쿠키를 걷을지·심을지와 게스트 차단을 적용할지뿐이다. 위조한 exp 로 게스트 차단을
 * 넘을 수는 있지만, 그건 게스트 쿠키를 손으로 지우기만 해도 아래 hasAuthCookie() 가
 * (값을 보지 않으므로) 통과시키던 것이라 이 판정이 새로 여는 문이 아니다.
 * 실제 집행은 백엔드가 한다 — 백엔드에 비회원 개념이 없어 인증 API 가 401 이다.
 */
function hasLiveAccessToken(req: NextRequest) {
  const payload = req.cookies.get("accessToken")?.value.split(".")[1];
  if (!payload) return false;

  try {
    // JWT 는 base64url 이라 표준 base64 문자로 바꿔서 읽는다.
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };

    return typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  } catch {
    // 우리가 아는 모양이 아니면 로그인했다고 볼 근거가 없다.
    return false;
  }
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
  const { pathname } = req.nextUrl;
  const redirectTarget = `${pathname}${req.nextUrl.search}`;
  const guestMode = hasGuestTrialCookie(req);

  // 공개 CTA는 API 조회 없이 진입한다. 새 문서로 이동해 클라이언트도 쿠키와 같은 상태가 된다.
  // 인증 쿠키가 있는 회원은 새 체험 쿠키로 덮지 않고, 도착한 화면에서 만료·정지를 확인한다.
  if (pathname === PUBLIC_SHOOT_ENTRY) {
    const memberCandidate = !guestMode && hasAuthCookie(req);
    const target = new URL(memberCandidate ? "/shoot?checkSession=1" : "/shoot", req.url);
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "private, no-store");
    return memberCandidate ? response : startGuestTrial(response, req.nextUrl.protocol === "https:");
  }

  // 로컬 개발 우회(임시) — 켜져 있으면 보호 경로 판정 자체를 건너뛴다.
  if (DEV_AUTH_BYPASS) {
    return NextResponse.next();
  }

  /*
    체험 쿠키는 **로그인이 끝나는 자리에서** 걷는다.

    콜백 페이지는 성공하면 `window.location.href` 로 문서를 새로 받아 zustand 에 남은
    게스트 상태를 비우지만(app/oauth2/callback/page.tsx 머리말), 쿠키는 문서를 새로 받아도
    살아남는다. 그대로 두면 체험하다 가입한 사람이 로그인을 마친 뒤에도 계속 비회원으로
    읽혀(lib/guestTrialStore.ts 의 hydrateGuestMode) 자기 프레임과 기록을 못 본다.
    이메일 로그인은 같은 일을 app/login/page.tsx 의 exitGuestMode() 가 한다.

    **살아 있는 access 토큰**이 함께 있을 때만 걷는다. 쿠키가 있는지만 보면, 인가에 실패해
    돌아왔거나 기록으로 이 주소를 다시 연 사람도 예전에 받아 둔 죽은 토큰 때문에 체험을
    잃는다 — 그 방문자는 곧이어 콜백 페이지가 상태 조회에서 401 을 받아 로그인 화면으로
    밀려나므로, 로그인도 체험도 없는 채로 남는다.
  */
  if (isSocialLoginCallback(pathname)) {
    const response = NextResponse.next();
    if (guestMode && hasLiveAccessToken(req)) {
      response.cookies.delete(GUEST_TRIAL_COOKIE);
    }
    return response;
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  /*
    **지금 로그인해 있는 것이 확인된 사람은 여기서 통과한다.** exp 가 남은 access 는
    미들웨어가 그 자리에서 확인할 수 있는 유일한 "회원" 근거다(위 hasLiveAccessToken).
    아래 게스트 판정보다 앞에 둬서, 체험 쿠키가 남아 있어도 회원 경로를 막지 않는다.
    체험 쿠키가 함께 있어도 **걷지는 않는다** — 걷는 자리는 소셜 콜백 하나뿐이다(위).
    화면은 그 쿠키를 보고 게스트로 그리지만, 그 사람은 실제로 회원이라 인증 API 가 답한다.
  */
  if (hasLiveAccessToken(req)) {
    return NextResponse.next();
  }

  /*
    **게스트로 그려 주는 화면은 회원 전용 촬영 경로에 못 들어간다 — 인증 쿠키가 있어도.**

    구멍이었다. 예전에는 아래 hasAuthCookie() 가 먼저였고, 그 판정은 쿠키가 **있는지만**
    보므로 「게스트 쿠키 + refreshToken 쿠키」를 함께 든 방문자가 `/shoot/upload`
    (GUEST_MEMBER_ONLY_PREFIXES)를 그냥 지나갔다 — 게스트 차단에 닿지도 못했다. 예전에
    있던 행사 QR 분기(`/shoot?event=`, 지금은 없다 — 행사는 `/e/{slug}` 로 옮겼다)가 그 조합을
    흔하게 만들었다(예전에 로그인해 둔 브라우저 + 방금 심은 체험 쿠키). 랜딩의 「가입 없이
    체험하기」로도 같은 조합이 생긴다. 화면은 이미 게스트다 —
    accessMode 는 이 쿠키만 보고(guestTrialStore 의 hydrateGuestMode), `/shoot/upload`
    화면에는 그것을 다시 보는 검사가 없다. 프록시가 유일한 집행 지점이었고 뚫려 있었다.
    비회원 범위는 약관 제8조와 `@harucut/shared` 의 GUEST_ALLOWED_ITEMS 가 "사진 촬영과
    이미지 저장"으로 못박는다.

    **막는 자리를 이 경로들로만 좁힌다.** 한때 게스트 판정 전체를 hasAuthCookie 앞으로
    옮겼는데, 그러면 access 만 만료된 회원이 체험 쿠키를 받은 뒤 `/home`·
    `/mypage`·`/history` 까지 통째로 막혔다 — 예전에는 지나가던 사람이고, 여기서 막을
    이유도 없다(그 경로들은 백엔드가 집행한다). 구멍은 `/shoot/upload` 하나였으므로 거기만
    닫는다.

    죽은 access 쿠키(형식이 깨졌거나 exp 가 지난)와 체험 쿠키를 함께 든 사람도 같은 구멍
    이었고, 같이 닫힌다.

    **이 판정은 인가가 아니다.** 브라우저에서 체험 쿠키를 지우면 아래 통과에 걸린다 —
    쿠키 값을 보지 않기 때문이다. 여기서 막는 것은 "우리가 게스트로 그려 주고 있는 화면이
    회원 전용 경로로 넘어가는 것"까지고, 실제 집행은 백엔드가 한다.
  */
  if (guestMode && isGuestMemberOnlyPath(pathname)) {
    return NextResponse.redirect(restrictedShootUrl(req));
  }

  /*
    여기까지 온 사람은 인증 쿠키가 **있기만 하면** 통과시킨다.

    이 판정은 쿠키가 있는지만 본다 — 서버가 이미 버린 죽은 토큰도 로그인으로 읽힌다
    (다른 기기에서 로그인하면 이 기기 refresh 가 죽는다: docs/backend-contract.md).
    죽은 쿠키를 든 사람을 여기서 로그인으로 보내지 않는 이유는, 그 판정을 미들웨어가
    확신할 수 없어서다(위 「세션 유효성을 백엔드에 묻지 않는다」). 회원이었던 사람을
    로그인으로 튕기는 대신, 화면이 인증 API 응답을 보고 처리하게 둔다.

    죽은 토큰이 여기서 로그인으로 읽힌다는 것이, 회원 전용 경로 차단을 이 판정보다 앞에
    둔 이유다. 순서를 되돌리지 않는다.

    **여기서 게스트 쿠키를 지우지는 않는다** — 걷는 자리는 소셜 콜백 하나뿐이다(위).
  */
  if (hasAuthCookie(req)) {
    return NextResponse.next();
  }

  if (guestMode) {
    if (isGuestAllowedPath(pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(restrictedShootUrl(req));
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
    "/studio/:path*",
    "/admin/:path*",
    // 보호 경로는 아니지만 로그인이 끝나는 자리라, 게스트 쿠키를 걷으러 들어간다.
    // matcher 는 Next 가 빌드 때 읽으므로 문자열을 그대로 적는다 —
    // 위 SOCIAL_LOGIN_CALLBACK 과 같은 값이어야 한다(proxy.test.ts 가 확인한다).
    "/oauth2/callback",
  ],
};
