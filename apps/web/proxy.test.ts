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

  프록시는 쿠키가 있는지만 볼 수 있어서 죽은 토큰과 살아 있는 세션을 구별하지 못한다.
  예전에는 보호 경로에서 인증 쿠키만 보고 체험 쿠키를 지웠는데, 그러면 죽은 쿠키가 남은
  사람이 "가입 없이 찍어보기"로 방금 심은 쿠키를 다음 요청에서 도로 잃었다.
*/
describe("proxy 회원 전환", () => {
  const STALE_AUTH = "accessToken=stale-session";

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
      request("/oauth2/callback", `${STALE_AUTH}; ${GUEST_TRIAL_COOKIE}=1`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    // 만료 시각을 과거로 준 Set-Cookie 가 나가야 브라우저 쿠키통에서 사라진다.
    expect(response.cookies.get(GUEST_TRIAL_COOKIE)?.value).toBe("");
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
