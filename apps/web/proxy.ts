import { NextRequest, NextResponse } from "next/server";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import {
  EVENT_ENTRY_QUERY,
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
} from "@/lib/guestTrialShared";
import {
  isGuestAllowedPath,
  isGuestMemberOnlyPath,
  isProtectedPath,
} from "@/lib/protectedPaths";

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
 * 행사장 QR 진입인지 본다.
 *
 * QR을 찍은 참가자는 대개 쿠키가 하나도 없는 새 브라우저로 `/shoot?frame=...&event=...` 에
 * 도착한다. 이 검사가 없으면 프록시가 먼저 /login 으로 돌려보내서, "가입 없이 바로 찍는다"는
 * 행사 흐름이 정작 행사장에서만 동작하지 않는다.
 *
 * "대개"인 이유는 아래 호출부에 적혀 있다 — 예전에 로그인했던 브라우저로도 찍는다.
 *
 * 촬영 진입점(`/shoot`)에만 적용한다 — QR이 가리키는 주소가 거기이고, 하위 단계는
 * 이 진입에서 심긴 쿠키로 이어진다.
 *
 * **이 주소는 QR 전용이 아니다.** 촬영 화면의 "프레임 다시 선택"이 돌아가는 곳이
 * 같은 `/shoot?frame=…&event=…` 이라(app/shoot/capture/page.tsx 의 `backToFrameHref`),
 * 행사 촬영 도중에도 같은 판정이 다시 돈다. 아래 호출부의 「남는 한계」가 그 이야기다.
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
    행사 QR은 "가입 없이 체험하기"를 누른 것과 같은 자격이다 — 랜딩 버튼으로 누구나 얻을 수
    있는 것과 같은 권한이므로 새로 여는 문이 아니다. 대신 행사 참가자는 그 버튼을 누를
    기회 자체가 없으므로 여기서 대신 시작시킨다.

    **인증 쿠키 판정보다 먼저 본다.** QR을 찍는 사람이 늘 빈 브라우저를 들고 오지는 않는다.
    예전에 로그인했던 브라우저에 죽은 쿠키가 남아 있으면 아래 통과가 먼저 걸려 체험 쿠키를
    심지 못했고, 그 방문자는 회원으로 읽히면서 인증 API 로는 401 을 받아 — 가입 없이
    찍는다는 행사 흐름이 정확히 행사장에서 막혔다.

    막는 것은 **살아 있는 access 토큰 하나뿐이다.** 회원이 QR로 들어온 것뿐일 수 있고 그
    사람을 체험 쿠키로 덮는 쪽이 손해라, 예전에는 refresh 쿠키가 남아 있기만 해도 심지
    않았다. 그런데 서버가 회수한 refresh 는 쿠키만 봐서는 살아 있는 것과 똑같이 보인다 —
    다른 기기에서 재로그인하면 Redis 의 REFRESH_TOKEN 키가 갈린다(docs/backend-contract.md
    「토큰」). 그래서 access 는 만료됐고 refresh 는 회수된 브라우저가 — 행사장에 흔한, 예전에
    로그인해 둔 그 브라우저다 — 체험 쿠키를 못 받고 아래 hasAuthCookie() 로 그냥 통과했다.
    화면은 회원인데 인증 API 는 전부 401 이라, 이 분기가 뚫으려던 "가입 없이 바로 촬영"이
    정확히 그 자리에서 다시 막혔다. 되살아날지 말지를 쿠키로 점치는 대신, 지금 로그인해
    있다는 것이 **확인되는 경우**(exp 가 남은 access)에만 비켜선다.

    **세션 유효성을 백엔드에 묻지 않는다.** 확실히 가리려면 물어야 하는데, 만료된 access
    로는 `/api/auth/status` 가 401 이라(백엔드는 refresh 를 access 로 받지 않는다 —
    docs/backend-contract.md 「토큰」의 AUTH-011 표) reissue 를 대신 불러야 한다. 그것은
    **토큰을 회전시키는 쓰기 요청**이고, 프록시는 RSC 프리페치를 포함한 모든 요청에 붙어
    있어 한 번의 진입이 여러 번 회전시킬 수 있다. 미들웨어가 돌려받은 새 쿠키를 응답에
    실어 주지 못한 회전은 그대로 버려진다.

    그 버려진 회전이 멀쩡한 세션을 실제로 끊는지는 **확인하지 않았다 — 추측이다.** 계약
    문서에 적힌 것은 한 줄뿐이다: "reissue 하면 이전 refresh 가 `REFRESH_GRACE:<jwt>` 로
    남는다(회전 유예)"(docs/backend-contract.md:53). 유예가 몇 개까지·얼마나 남는지, 겹친
    회전이 서로를 무효화하는지는 그 문서에 없고 우리도 재현해 보지 않았다. 확인된 것만
    놓고 봐도 **모든 진입에 검증 안 된 쓰기를 거는 쪽**의 위험이 진입 하나를 가리는 이득
    보다 커서, 미들웨어에서는 그 자리에서 읽히는 것(access 의 exp)만 본다. 이 판단을 다시
    보려면 백엔드에 회전 유예의 개수와 수명부터 물어야 한다.

    **남는 한계.** access 만 자연 만료되고 refresh 는 멀쩡한 회원이 이 주소를 열면 7일짜리
    체험 쿠키를 받는다. 진입 시점(QR)만의 이야기가 아니다 — 같은 주소가 촬영 화면의
    "프레임 다시 선택" 목적지이기도 해서(app/shoot/capture/page.tsx 의 `backToFrameHref`),
    행사 촬영 도중 access 가 만료된 회원이 그 버튼을 눌러 이 주소를 다시 열면 자기 촬영
    중간에 게스트로 뒤집힌다. 새로고침이면 확실하고, 앱 안에서의 이동도 RSC 요청으로
    프록시를 지나가지만 그때 Set-Cookie 가 실제로 브라우저에 남는지는 **확인하지 않았다.**

    뒤집힌 그 회원은 이제 아래 게스트 판정을 받는다 — `/shoot` 아래는 그대로 찍고,
    `/shoot/upload` 와 그 밖의 보호 경로에서는 `guestNotice=restricted` 안내를 만난다.
    되돌릴 길은 있다 — 공개 화면의 촬영 CTA 를 한 번 누르거나(lib/usePublicShootCta.ts 가
    서버로 확인하고 쿠키를 걷는다) 다시 로그인하면 회원으로 돌아온다. 반대쪽(행사 참가자가
    아예 못 찍는 것)에는 그런 길이 없어서 이쪽을 골랐다.
  */
  if (
    isEventEntry(pathname, req.nextUrl.searchParams) &&
    !guestMode &&
    !hasLiveAccessToken(req)
  ) {
    return startGuestTrial(
      NextResponse.next(),
      req.nextUrl.protocol === "https:",
    );
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
    (GUEST_MEMBER_ONLY_PREFIXES)를 그냥 지나갔다 — 게스트 차단에 닿지도 못했다. 위 행사 QR
    분기가 refresh 를 더 이상 회원 근거로 보지 않게 되면서 행사 방문자 상당수가 정확히 그
    조합이 된다(예전에 로그인해 둔 브라우저 + 방금 심은 체험 쿠키). 화면은 이미 게스트다 —
    accessMode 는 이 쿠키만 보고(guestTrialStore 의 hydrateGuestMode), `/shoot/upload`
    화면에는 그것을 다시 보는 검사가 없다. 프록시가 유일한 집행 지점이었고 뚫려 있었다.
    비회원 범위는 약관 제8조와 `@harucut/shared` 의 GUEST_ALLOWED_ITEMS 가 "사진 촬영과
    이미지 저장"으로 못박는다.

    **막는 자리를 이 경로들로만 좁힌다.** 한때 게스트 판정 전체를 hasAuthCookie 앞으로
    옮겼는데, 그러면 access 만 만료된 회원이 행사 주소를 열어 체험 쿠키를 받은 뒤 `/home`·
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
    const shootUrl = new URL("/shoot", req.url);
    shootUrl.searchParams.set("guestNotice", "restricted");
    return NextResponse.redirect(shootUrl);
  }

  /*
    여기까지 온 사람은 인증 쿠키가 **있기만 하면** 통과시킨다.

    이 판정은 쿠키가 있는지만 본다 — 서버가 이미 버린 죽은 토큰도 로그인으로 읽힌다
    (다른 기기에서 로그인하면 이 기기 refresh 가 죽는다: docs/backend-contract.md).
    죽은 쿠키를 든 사람을 여기서 로그인으로 보내지 않는 이유는, 그 판정을 미들웨어가
    확신할 수 없어서다(위 「세션 유효성을 백엔드에 묻지 않는다」). 회원이었던 사람을
    로그인으로 튕기는 대신, 화면이 인증 API 응답을 보고 처리하게 둔다.

    죽은 토큰이 여기서 로그인으로 읽힌다는 것이, 위 행사 QR 예외와 회원 전용 경로 차단을
    둘 다 이 판정보다 앞에 둔 이유다. 순서를 되돌리지 않는다.

    **여기서 게스트 쿠키를 지우지는 않는다** — 걷는 자리는 소셜 콜백 하나뿐이다(위).
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
