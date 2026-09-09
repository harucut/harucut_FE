/** @jest-environment node */

// 프록시는 브라우저가 아니라 Next 런타임이 부르므로 node 환경에서 돌린다.

import { NextRequest } from "next/server";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { config, proxy } from "@/proxy";

const ORIGIN = "https://harucut.test";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, ORIGIN), {
    headers: cookie ? { cookie } : {},
  });
}

function guestRequest(path: string) {
  return request(path, `${GUEST_TRIAL_COOKIE}=1`);
}

const GUEST_RESTRICTED = `${ORIGIN}/shoot?guestNotice=restricted`;

/** 로그인했던 흔적만 남은 쿠키. JWT 모양이 아니라 프록시가 살아 있다고 볼 수 없다. */
const STALE_AUTH = "accessToken=stale-session";

/** exp 만 든 access 토큰. 프록시는 서명을 보지 않으므로 머리·꼬리는 자리만 채운다. */
function accessToken(secondsFromNow: number) {
  const claims = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  ).toString("base64url");

  return `accessToken=header.${claims}.signature`;
}

/*
  App Router 가 같은 페이지를 부르는 주소 모양들. 프록시가 받는 pathname 은 사람이 치는
  주소가 아니라 이 모양들이기도 하다(`.rsc` 는 Next 가 먼저 떼어낸 뒤 넘긴다).
*/
const UPLOAD_ADDRESSES = [
  "/shoot/upload",
  "/shoot/upload/",
  "/shoot/upload.segments/_tree.segment",
  "/shoot/upload.segments/shoot.segment",
  "/shoot/upload.html",
  "/shoot/upload.json",
  "/shoot/upload.meta",
  "/shoot/upload.txt",
];

describe("proxy 비회원 체험 분기", () => {
  test("촬영 흐름은 그대로 지나간다", async () => {
    const steps = [
      "/shoot",
      "/shoot/capture",
      "/shoot/select",
      "/shoot/result",
    ];

    for (const path of steps) {
      const response = await proxy(guestRequest(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  test("촬영 흐름은 세그먼트 프리페치 주소로 불러도 지나간다", async () => {
    const response = await proxy(
      guestRequest("/shoot/capture.segments/_tree.segment"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  /*
    회귀. 갤러리 불러오기는 회원 전용인데, 차단이 `/shoot/upload` 문자열만 보고 있었다.
    Next 가 같은 페이지를 `/shoot/upload.segments/_tree.segment` 로도 부르기 때문에
    비회원 쿠키만 가진 사람이 그 주소로 부르면 차단을 지나쳐 `/shoot` 허용에 걸렸다.
    주소 모양마다 판정이 갈리지 않는지 전부 확인한다.
  */
  test.each(UPLOAD_ADDRESSES)(
    "갤러리 불러오기는 %s 로 불러도 막는다",
    async (path) => {
      const response = await proxy(guestRequest(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(GUEST_RESTRICTED);
    },
  );

  test("이름이 비슷한 다른 경로까지 막지는 않는다", async () => {
    const response = await proxy(guestRequest("/shoot/uploads"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("촬영 밖 보호 경로는 막는다", async () => {
    for (const path of ["/home", "/history", "/theme", "/mypage"]) {
      const response = await proxy(guestRequest(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(GUEST_RESTRICTED);
    }
  });
});

describe("proxy 비인증 분기", () => {
  test("쿠키가 없으면 로그인으로 보낸다", async () => {
    const response = await proxy(request("/shoot/upload"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?redirectTo=%2Fshoot%2Fupload`,
    );
  });

  test("공개 경로는 건드리지 않는다", async () => {
    const response = await proxy(request("/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

/*
  게스트 → 회원 전환은 **로그인이 끝나는 자리에서만** 한다.

  보호 경로에서 프록시가 보는 것은 쿠키가 있는지뿐이라 죽은 토큰과 살아 있는 세션을
  구별하지 못한다. 예전에는 그것만 보고 체험 쿠키를 지웠는데, 그러면 죽은 쿠키가 남은
  사람이 "가입 없이 찍어보기"로 방금 심은 쿠키를 다음 요청에서 도로 잃었다.
  콜백에서 걷을 때는 access 토큰의 exp 까지 읽어 살아 있을 때만 걷는다.
*/
describe("proxy 회원 전환", () => {
  test("인증 쿠키가 남아 있어도 비회원 체험 쿠키를 지우지 않는다", async () => {
    for (const path of ["/shoot", "/shoot/capture"]) {
      const response = await proxy(
        request(path, `${STALE_AUTH}; ${GUEST_TRIAL_COOKIE}=1`),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  test("소셜 로그인 콜백에서는 체험 쿠키를 걷는다", async () => {
    const response = await proxy(
      request(
        "/oauth2/callback",
        `${accessToken(3600)}; ${GUEST_TRIAL_COOKIE}=1`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    // 만료 시각을 과거로 준 Set-Cookie 가 나가야 브라우저 쿠키통에서 사라진다.
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("");
  });

  /*
    회귀. 체험 전에 받아 둔 토큰이 남은 사람이 인가에 실패해 돌아오거나 브라우저 기록으로
    콜백을 다시 열면, 쿠키가 있다는 이유만으로 체험을 잃었다. 그 방문자는 이어지는 상태
    조회에서 401 을 받아 로그인 화면으로 밀려나므로 로그인도 체험도 없이 남는다.
  */
  test.each([
    ["만료된 access 토큰", accessToken(-3600)],
    ["형식이 다른 토큰", STALE_AUTH],
    // refresh 는 다른 기기 로그인으로 서버가 지울 수 있어 만료 전에도 죽어 있을 수 있다.
    ["refresh 토큰만", "refreshToken=stale-session"],
  ])("콜백에 %s 만 들고 왔으면 체험을 그대로 둔다", async (_label, cookie) => {
    const response = await proxy(
      request("/oauth2/callback", `${cookie}; ${GUEST_TRIAL_COOKIE}=1`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("콜백에 빈손으로 돌아왔으면 체험을 그대로 둔다", async () => {
    // 인가에 실패해 인증 쿠키 없이 돌아온 사람. 체험까지 뺏지 않는다.
    const response = await proxy(guestRequest("/oauth2/callback"));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("콜백 경로가 matcher 에 들어 있다", () => {
    // 여기 빠지면 프록시가 콜백에서 아예 돌지 않아 위 두 케이스가 실제로는 일어나지 않는다.
    expect(config.matcher).toContain("/oauth2/callback");
  });
});

/*
  행사 QR 진입은 **죽은 인증 쿠키에 가리지 않는다.**

  QR 을 찍는 사람이 늘 빈 브라우저를 들고 오지는 않는다. 예전에 로그인했던 브라우저에
  형식이 깨진 인증 쿠키가 남아 있으면, 쿠키가 있다는 것만 보고 통과시키던 판정이
  체험 쿠키를 심을 기회를 먹었다. 그 방문자는 회원으로 읽히지만 인증 API 는 401 이라
  "가입 없이 찍는다"는 행사 흐름이 통째로 막힌다.

  반대쪽도 같이 고정한다. 되살릴 수 있는 세션(살아 있는 access, 또는 남아 있는 refresh)이
  보이면 심지 않는다 — 회원을 7일짜리 체험 쿠키로 덮어쓰는 쪽이 더 큰 손해다.
*/
describe("proxy 행사 QR 진입", () => {
  const EVENT_ENTRY = "/shoot?frame=classic&event=hongdae-2026";

  test("쿠키가 하나도 없으면 체험 쿠키를 심어 통과시킨다", async () => {
    const response = await proxy(request(EVENT_ENTRY));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("1");
  });

  // 회귀. 아래 둘이 없으면 행사 참가자가 로그인 화면으로 밀린다.
  test.each([
    ["형식이 깨진 access 쿠키", STALE_AUTH],
    ["만료된 access 쿠키", accessToken(-3600)],
  ])("%s 만 남아 있어도 체험 쿠키를 심는다", async (_label, cookie) => {
    const response = await proxy(request(EVENT_ENTRY, cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("1");
  });

  test.each([
    ["살아 있는 access 토큰", accessToken(3600)],
    // refresh 는 살아 있는지 알 수 없다. 회원일 가능성이 있으면 게스트로 덮지 않는다.
    ["refresh 쿠키", "refreshToken=maybe-live"],
    [
      "access 는 죽었지만 refresh 가 남은 회원",
      `${STALE_AUTH}; refreshToken=maybe-live`,
    ],
  ])("%s 를 든 방문자는 게스트로 만들지 않는다", async (_label, cookie) => {
    const response = await proxy(request(EVENT_ENTRY, cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("행사 QR 이 아닌 보호 경로는 죽은 쿠키로도 그대로 통과한다", async () => {
    // 보호 경로 판정 자체는 건드리지 않았다는 고정.
    const response = await proxy(request("/home", STALE_AUTH));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("이미 체험 중이면 쿠키를 다시 심지 않는다", async () => {
    const response = await proxy(
      request(EVENT_ENTRY, `${GUEST_TRIAL_COOKIE}=1`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
