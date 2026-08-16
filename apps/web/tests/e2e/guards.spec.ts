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

/**
 * 행사장 QR 로 들어온 참가자.
 *
 * 쿠키가 하나도 없는 새 브라우저로 도착하므로, 프록시가 여기서 막으면 "가입 없이 바로
 * 찍는다"는 행사 흐름이 정작 행사장에서만 동작하지 않는다.
 */
test("lets an event QR visitor shoot without signing up", async ({ page }) => {
  await page.goto("/shoot?frame=classic-4&event=%EC%97%AC%EB%A6%84%20%ED%8C%AC%EB%AF%B8%ED%8C%85");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/shoot");
  await expect(page.getByText("여름 팬미팅")).toBeVisible();

  // 다음 단계로 이어질 수 있도록 비회원 체험 쿠키가 심겨야 한다.
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === "harucut_guest_trial")?.value,
  ).toBe("1");
});

// event 없이 오는 /shoot 은 그대로 로그인으로 보낸다(위 protectedRoutes 가 검증한다).

/**
 * 촬영 화면에서 "프레임 다시 선택"으로 돌아와도 행사 맥락이 살아 있어야 한다.
 *
 * 돌아오는 주소에 행사 쿼리가 없으면 세션이 초기화되면서 행사 이름과 컷 구성이 함께
 * 사라졌다. 참가자가 구성을 한 번 바꿔보려다 행사에서 튕겨 나오는 셈이었다.
 */
test("keeps the event context when going back to frame selection", async ({
  page,
}) => {
  await page.goto("/shoot?frame=classic-4&event=%EC%97%AC%EB%A6%84%20%ED%8C%AC%EB%AF%B8%ED%8C%85");
  await expect(page.getByText("여름 팬미팅")).toBeVisible();

  await page.getByRole("button", { name: "촬영 시작하기" }).click();
  await page.waitForURL("**/shoot/capture");
  await expect(page.getByText("여름 팬미팅")).toBeVisible();

  await page.getByRole("link", { name: "프레임 다시 선택" }).click();
  // `**/shoot**` 로 기다리면 아직 /shoot/capture 인 상태에서 바로 통과해, 검사가
  // 촬영 화면의 배너를 다시 보는 꼴이 된다. 프레임 선택 화면에 도착한 것을 정확히 본다.
  await page.waitForURL((url) => new URL(url).pathname === "/shoot");
  await expect(
    page.getByRole("heading", { name: "프레임 선택" }),
  ).toBeVisible();
  await expect(page.getByText("여름 팬미팅")).toBeVisible();
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
