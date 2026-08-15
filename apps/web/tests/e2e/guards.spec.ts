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
  "/upload",
  "/upload/select",
  "/decorate",
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

// 게스트 체험은 촬영과 꾸미기까지 허용한다(꾸미기 저장 시 로그인 유도).
const guestAllowedRoutes = ["/shoot", "/decorate"];

for (const route of guestAllowedRoutes) {
  test(`keeps guests on ${route} instead of the login page`, async ({
    page,
  }) => {
    await enableGuestContext(page);
    await page.goto(route);

    expect(new URL(page.url()).pathname).not.toBe("/login");
  });
}

test("redirects guests away from non-trial protected routes", async ({
  page,
}) => {
  await enableGuestContext(page);
  await page.goto("/history");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/shoot");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("guestNotice"))
    .toBe("restricted");
});

const lateStepRoutes = [
  { route: "/shoot/select", expected: "/shoot" },
  { route: "/shoot/result", expected: "/shoot" },
  { route: "/upload/select", expected: "/upload" },
  { route: "/upload/result", expected: "/upload" },
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
