import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { GUEST_TRIAL_COOKIE } from "@/lib/guestTrialShared";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${Number(process.env.PORT ?? 3000)}`;

async function enableAuthenticatedContext(page: Page) {
  // 쿠키만으로는 부족하다. 인증 게이트가 클라이언트에 있어서 백엔드가 401을 주면 화면이
  // /login으로 갈아타고, 이 스펙이 검증하려는 "세션 상태가 없을 때의 복구"에 도달조차 못 한다.
  // 백엔드가 떠 있는 개발 머신에서만 실패하던 원인이라, API를 고정 응답으로 막아 둔다.
  await stubAuthenticatedApi(page);
  await page.context().addCookies([
    {
      name: "accessToken",
      value: "e2e-session",
      url: baseURL,
    },
  ]);
}

async function enableGuestContext(page: Page) {
  await page.context().addCookies([
    {
      name: GUEST_TRIAL_COOKIE,
      value: "1",
      url: baseURL,
    },
  ]);
}

const protectedRoutes = [
  "/home",
  "/shoot",
  "/shoot/capture",
  "/theme",
  "/theme/sticker",
  "/history",
  "/mypage",
];

for (const route of protectedRoutes) {
  test(`redirects ${route} to login when unauthenticated`, async ({ page }) => {
    await page.goto(route);

    await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("redirectTo"))
      .toBe(route);
  });
}

test("preserves the original query string in redirectTo", async ({ page }) => {
  await page.goto("/shoot/capture?mode=retry");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("redirectTo"))
    .toBe("/shoot/capture?mode=retry");
});

/**
 * 옛 행사 QR 주소(`/shoot?event=`)는 걷어냈다. 행사는 `/e/{slug}` 로 옮겼고 배포한 QR 이 없어
 * 호환하지 않는다(기획 R3·R4 검수 D01). 이 주소는 이제 평범한 `/shoot` 이다 — 쿠키가 없으면
 * 로그인으로 가고, 체험 쿠키를 심지 않는다.
 */
test("treats the retired event QR address as a plain protected shoot route", async ({ page }) => {
  await page.goto("/shoot?frame=classic-4&event=%EC%97%AC%EB%A6%84%20%ED%8C%AC%EB%AF%B8%ED%8C%85");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "harucut_guest_trial")).toBeUndefined();
});

/**
 * 촬영 화면에서 "프레임 다시 선택"으로 돌아와도 고른 컷 구성이 살아 있어야 한다.
 *
 * 돌아오는 주소에 프레임 쿼리가 없으면 세션이 초기화되면서 컷 구성이 사라진다.
 */
test("keeps the chosen frame when going back to frame selection", async ({ page }) => {
  // 랜딩의 「가입 없이 체험하기」와 같은 진입이다 — 체험 쿠키를 받고 /shoot 으로 간다.
  await page.goto("/shoot/start");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/shoot");

  await page.getByRole("button", { name: "촬영 시작하기" }).click();
  await page.waitForURL("**/shoot/capture");

  await page.getByRole("link", { name: "프레임 다시 선택" }).click();
  // `**/shoot**` 로 기다리면 아직 /shoot/capture 인 상태에서 바로 통과한다.
  await page.waitForURL((url) => new URL(url).pathname === "/shoot");
  await expect(page.getByRole("heading", { name: "프레임 선택" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("frame")).not.toBeNull();
});

// 게스트 체험은 촬영까지다. 찍고 그 이미지를 받는 데까지만 열려 있다.
const guestAllowedRoutes = ["/shoot"];

for (const route of guestAllowedRoutes) {
  test(`keeps guests on ${route} instead of the login page`, async ({
    page,
  }) => {
    await enableGuestContext(page);
    await page.goto(route);

    expect(new URL(page.url()).pathname).not.toBe("/login");
  });
}

// 게스트에게 열린 곳은 /shoot 뿐이다(lib/protectedPaths.ts GUEST_ALLOWED_PREFIXES).
// 화면 문구가 "기록 보관·프레임 만들기는 가입 후"라고 말하는 것과 실제 권한이 맞아야 한다.
// /shoot/upload 는 접두사로는 열린 /shoot 안에 있는 회원 전용 예외다
// (같은 파일 GUEST_MEMBER_ONLY_PREFIXES). 갤러리 불러오기는 가입 후다.
const guestBlockedRoutes = ["/history", "/theme", "/shoot/upload"];

for (const route of guestBlockedRoutes) {
  test(`redirects guests away from ${route}`, async ({ page }) => {
    await enableGuestContext(page);
    await page.goto(route);

    await expect.poll(() => new URL(page.url()).pathname).toBe("/shoot");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("guestNotice"))
      .toBe("restricted");
  });
}

const lateStepRoutes = [
  { route: "/shoot/select", expected: "/shoot" },
  { route: "/shoot/result", expected: "/shoot" },
  { route: "/theme/sticker", expected: "/theme" },
] as const;

for (const { route, expected } of lateStepRoutes) {
  test(`authenticated direct visit to ${route} recovers to ${expected} when session state is missing`, async ({
    page,
  }) => {
    await enableAuthenticatedContext(page);
    await page.goto(route);

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toBe(expected);
  });
}

/**
 * 홈의 「최근 기록」 카드는 `/history#media-<id>` 로 들어온다.
 *
 * SPA 이동이라 첫 렌더에는 목록이 아직 없어서, 브라우저의 해시 스크롤이 한 번 헛돌고 끝난다.
 * 그대로 두면 어느 카드를 눌러도 목록 맨 위로만 간다.
 */
test("scrolls to the linked record after the history list loads", async ({
  page,
}) => {
  await stubAuthenticatedApi(page);
  await page.context().addCookies([
    { name: "accessToken", value: "guard-session", url: "http://localhost:3000" },
  ]);

  // 목록 맨 아래쪽 기록을 노린다 — 첫 화면에 보이는 것이면 "옮겼다"를 증명하지 못한다.
  await page.goto("/history#media-9109");

  const target = page.locator("#media-9109");
  await expect(target).toBeVisible();

  // 화면 안(뷰포트)에 들어와 있어야 한다.
  const inView = await target.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight;
  });
  expect(inView).toBe(true);
});
