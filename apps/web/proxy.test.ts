/** @jest-environment node */

// 프록시는 브라우저가 아니라 Next 런타임이 부르므로 node 환경에서 돌린다.

import { NextRequest } from "next/server";
import {
  GUEST_TRIAL_COOKIE,
  GUEST_TRIAL_COOKIE_MAX_AGE,
} from "@/lib/guestTrialShared";
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

/*
  **JWT 모양이기는 한데 페이로드가 깨진** 토큰 둘. 위 STALE_AUTH 는 점이 없어서 프록시가
  JWT 파싱에 들어가기도 전에 돌아 나오므로, 파싱 실패 처리(hasLiveAccessToken 의 catch)에는
  이 둘만 닿는다. 이 케이스가 없으면 그 catch 가 `true` 를 돌려주도록 뒤집어도 아래 테스트가
  전부 통과했다 — 그러면 쓰레기 쿠키 하나가 "살아 있는 회원"으로 읽힌다.
*/
/** base64 로 읽히지 않는 페이로드 — atob 이 던진다. */
const BROKEN_BASE64_AUTH = "accessToken=header.not*base64.signature";
/** base64 로는 읽히는데 JSON 이 아닌 페이로드 — JSON.parse 가 던진다. */
const BROKEN_JSON_AUTH = `accessToken=header.${Buffer.from("not-json").toString("base64url")}.signature`;

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
    ["페이로드가 base64 가 아닌 토큰", BROKEN_BASE64_AUTH],
    ["페이로드가 JSON 이 아닌 토큰", BROKEN_JSON_AUTH],
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
  행사 QR 진입에서 미들웨어가 하는 일은 **하나뿐이다** — 쿠키가 아예 없는 방문자에게
  체험 쿠키를 심어 `/shoot` 이 로그인으로 튕기지 않게 하는 것.

  쿠키가 남아 있는 브라우저(행사장에 흔하다)는 그냥 통과시킨다. 그 쿠키가 살아 있는지는
  여기서 알 수 없고 — 재발급은 토큰을 회전시키는 쓰기라 모든 요청에 붙는 프록시가 할 일이
  아니다 — 화면이 `isUsableMember()` 로 물어본 뒤 정말 회원이 아닐 때만 전환한다.
  그 판정과 이유는 proxy.ts 의 분기 주석과 app/shoot/page.tsx 에 있다.
*/
describe("proxy 행사 QR 진입", () => {
  const EVENT_ENTRY = "/shoot?frame=classic&event=hongdae-2026";

  test("쿠키가 하나도 없으면 체험 쿠키를 심어 통과시킨다", async () => {
    const response = await proxy(request(EVENT_ENTRY));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("1");
  });

  /*
    회귀 — **인증 쿠키가 하나라도 있으면 여기서는 심지 않는다.**

    한때 「살아 있는 access 만 아니면 심는다」로 두었다. 회수된 refresh 를 든 행사 참가자를
    회원으로 오해해 막지 말자는 뜻이었는데, 반대쪽을 더 크게 깼다 — access 만 자연 만료되고
    refresh 는 멀쩡한 회원(흔하다)이 QR 을 찍으면 7일짜리 체험 쿠키를 받았고, `clientApi` 가
    재발급에 성공한 뒤에도 `guestTrialStore` 는 그 쿠키만 보고 게스트로 복원해 기록·커스텀
    프레임을 잃었다.

    쿠키가 살아 있는지는 미들웨어가 알 수 없다(재발급은 토큰을 회전시키는 쓰기이고 프록시는
    모든 요청에 붙는다 — proxy.ts 의 그 분기 주석). 그래서 **판정을 화면으로 넘긴다.**
    쿠키가 있으면 그냥 통과시키고, `app/shoot/page.tsx` 가 `isUsableMember()` 로 —
    재발급을 포함해 — 물어본 뒤 정말 회원이 아닐 때만 체험을 시작한다.
  */
  test.each([
    ["형식이 깨진 access 쿠키", STALE_AUTH],
    ["만료된 access 쿠키", accessToken(-3600)],
    ["페이로드가 base64 가 아닌 access 쿠키", BROKEN_BASE64_AUTH],
    ["페이로드가 JSON 이 아닌 access 쿠키", BROKEN_JSON_AUTH],
    ["회수된 refresh 쿠키만", "refreshToken=revoked-elsewhere"],
    [
      "만료된 access 와 회수된 refresh",
      `${accessToken(-3600)}; refreshToken=revoked-elsewhere`,
    ],
    ["살아 있는 access 토큰", accessToken(3600)],
    ["살아 있는 access 와 refresh", `${accessToken(3600)}; refreshToken=live`],
  ])("%s 를 들고 오면 심지 않고 통과시킨다", async (_label, cookie) => {
    const response = await proxy(request(EVENT_ENTRY, cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  /*
    반대쪽 못. 쿠키가 **아예 없는** 방문자에게는 여기서 심어야 한다 — 물어볼 곳이 없고,
    안 심으면 `/shoot` 이 보호 경로라 로그인으로 튕겨 행사 흐름이 그 자리에서 끊긴다.
    이 못이 없으면 「행사 분기를 통째로 없앤다」로 고쳐도 위 테스트가 전부 통과한다.
  */
  test("쿠키가 없는 방문자에게는 심어서 로그인으로 튕기지 않는다", async () => {
    const response = await proxy(request(EVENT_ENTRY));

    expect(response.status).toBe(200);
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("1");
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

  /*
    **행사 진입이 아닌 것에 못을 박는다.**

    `isEventEntry` 가 보는 조건은 둘이다 — 경로가 **정확히** `/shoot` 이고, `event` 쿼리에
    공백이 아닌 값이 있을 것. 위 회귀 테스트들은 전부 그 둘을 만족하는 주소만 부르므로,
    조건을 지워도(`event` 를 안 보게) 넓혀도(`startsWith("/shoot")`) 전부 통과했다.
    그렇게 넓히면 평범한 `/shoot` 방문자와 하위 단계 직접 진입자까지 7일짜리 게스트가 된다.
  */
  test.each([
    ["event 쿼리가 없는 촬영 진입점", "/shoot"],
    ["event 없이 프레임만 든 진입점", "/shoot?frame=classic"],
    ["행사 쿼리를 든 회원 전용 하위 경로", "/shoot/upload?event=hongdae-2026"],
    ["행사 쿼리를 든 촬영 단계", "/shoot/capture?event=hongdae-2026"],
  ])("%s 는 쿠키가 없으면 로그인으로 보낸다", async (_label, path) => {
    const response = await proxy(request(path));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/login?redirectTo=${encodeURIComponent(path)}`,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("event 값이 공백뿐이면 행사 진입으로 보지 않는다", async () => {
    const response = await proxy(request("/shoot?frame=classic&event=%20%20"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?redirectTo=");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  /*
    심는 쿠키의 **속성**까지 고정한다. 클라이언트(guestTrialStore.setGuestCookie)가 심는
    것과 같아야 한쪽이 심고 다른 쪽이 못 읽는 일이 없다. 값만 보던 위 테스트들은
    max-age 를 60초로 줄여도, path 를 `/shoot` 으로 좁혀도 전부 통과했다.
  */
  test("심는 체험 쿠키의 속성은 클라이언트와 같은 값이다", async () => {
    const cookie = (await proxy(request(EVENT_ENTRY))).cookies.get(
      GUEST_TRIAL_COOKIE,
    );

    expect(cookie?.value).toBe("1");
    // 기간은 공유 상수와 대조한다 — 숫자를 여기 또 적으면 그게 세 번째 사본이 된다.
    expect(cookie?.maxAge).toBe(GUEST_TRIAL_COOKIE_MAX_AGE);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.secure).toBe(true);
  });

  test("http 로 들어오면 Secure 를 붙이지 않는다", async () => {
    // 로컬 개발(http://localhost:3000)에서 Secure 를 붙이면 브라우저가 아예 저장하지 않아
    // 체험이 시작되지 않는다.
    const response = await proxy(
      new NextRequest(new URL(EVENT_ENTRY, "http://localhost:3000")),
    );

    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("1");
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.secure).toBe(false);
  });
});

/*
  회귀. **「게스트 쿠키 + 인증 쿠키」 조합이 회원 전용 경로를 그냥 지나갔다.**

  통과 판정(hasAuthCookie)이 게스트 판정보다 앞에 있었고, 그 판정은 쿠키가 있는지만 본다.
  그래서 체험 쿠키를 든 사람이라도 `refreshToken` 쿠키가 하나 남아 있으면 `/shoot/upload`
  차단에 **닿지도 못했다.** 위 행사 QR 분기가 refresh 를 회원 근거로 보지 않게 된 뒤로는
  그 조합이 행사장에서 그대로 만들어진다 — 예전에 로그인해 둔 브라우저로 QR 을 찍으면
  체험 쿠키가 심기고 refresh 쿠키는 남는다. 화면 쪽 방어도 없다
  (app/shoot/upload/page.tsx 는 accessMode 를 보지 않는다).
*/
describe("proxy 게스트 쿠키와 죽은 인증 쿠키가 함께 있을 때", () => {
  const DEAD_SESSIONS: [string, string][] = [
    ["회수된 refresh 쿠키", "refreshToken=revoked-elsewhere"],
    ["형식이 깨진 access 쿠키", STALE_AUTH],
    [
      "만료된 access 와 refresh",
      `${accessToken(-3600)}; refreshToken=revoked-elsewhere`,
    ],
  ];

  function guestWith(path: string, cookie: string) {
    return request(path, `${cookie}; ${GUEST_TRIAL_COOKIE}=1`);
  }

  test.each(DEAD_SESSIONS)(
    "%s 가 있어도 회원 전용 경로는 막는다",
    async (_label, cookie) => {
      const response = await proxy(guestWith("/shoot/upload", cookie));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(GUEST_RESTRICTED);
    },
  );

  test("세그먼트 프리페치 주소로 불러도 막는다", async () => {
    const response = await proxy(
      guestWith(
        "/shoot/upload.segments/_tree.segment",
        "refreshToken=revoked-elsewhere",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(GUEST_RESTRICTED);
  });

  /*
    반대쪽 못 — **촬영 밖 보호 경로까지 막지는 않는다.**

    한때 게스트 판정 전체를 인증 쿠키 통과 앞으로 옮겨 여기서도 307 을 줬는데, 그러면
    access 만 자연 만료된 **진짜 회원**이 행사 주소를 열어 체험 쿠키를 받은 순간
    `/home`·`/mypage`·`/history` 까지 통째로 막힌다. 미들웨어는 refresh 가 살아 있는지
    죽었는지 구별하지 못하므로(같은 쿠키 모양이다) 여기서 막는 것은 멀쩡한 회원을
    쫓아내는 쪽으로도 똑같이 작동한다.

    구멍은 `/shoot/upload` 하나였다. 그 경로만 닫고, 나머지는 이 파일이 원래 세워 둔 규칙
    ―「쿠키가 있으면 통과시키고 유효성은 화면이 인증 API 응답으로 처리한다」― 을 그대로 둔다.
  */
  test.each(DEAD_SESSIONS)(
    "%s 가 있어도 촬영 밖 보호 경로는 인증 쿠키를 믿고 지나간다",
    async (_label, cookie) => {
      for (const path of ["/history", "/home", "/mypage"]) {
        const response = await proxy(guestWith(path, cookie));

        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
      }
    },
  );

  /*
    다만 인증 쿠키가 **아예 없는** 체험 쿠키 단독은 예전 그대로 막힌다 — 위 완화가
    게스트 차단 자체를 끄지 않았다는 못이다.
  */
  test("체험 쿠키만 있으면 촬영 밖 보호 경로는 그대로 막는다", async () => {
    const response = await proxy(request("/history", `${GUEST_TRIAL_COOKIE}=1`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(GUEST_RESTRICTED);
  });

  test.each(DEAD_SESSIONS)(
    "%s 가 있어도 촬영 흐름은 그대로 지나간다",
    async (_label, cookie) => {
      // 구멍을 닫으면서 "가입 없이 바로 촬영"까지 닫아 버리면 행사 흐름이 죽는다.
      for (const path of ["/shoot", "/shoot/capture", "/shoot/result"]) {
        const response = await proxy(guestWith(path, cookie));

        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
      }
    },
  );

  /*
    반대쪽 못. **지금 로그인해 있는 것이 확인된 사람**(exp 가 남은 access)은 체험 쿠키가
    남아 있어도 회원 경로를 그대로 쓴다 — 그 사람은 실제로 회원이라 인증 API 가 답한다.
    이 못이 없으면 "게스트 쿠키가 있으면 무조건 게스트"로 고쳐도 위가 전부 통과한다.
  */
  test.each(["/shoot/upload", "/home", "/mypage"])(
    "살아 있는 access 를 들었으면 %s 도 통과한다",
    async (path) => {
      const response = await proxy(
        request(path, `${accessToken(3600)}; ${GUEST_TRIAL_COOKIE}=1`),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      // 통과시키되 체험 쿠키를 걷지는 않는다 — 걷는 자리는 소셜 콜백 하나뿐이다.
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );
});
