import { expect, test } from "@playwright/test";

test("landing primary CTA routes unauthenticated users to login", async ({ page }) => {
  await page.goto("/");
  // 로그인 우선. 히어로의 "로그인"은 두 화면 폭 모두에 있고, 헤더의 "지금 시작하기"는
  // 넓은 화면에만 있다(home.spec.ts 가 그 경계를 검사한다). 둘 다 /login 으로 간다.
  await page.getByRole("link", { name: "로그인" }).click();

  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
});

test("login page preserves redirectTo in auth links", async ({ page }) => {
  await page.goto("/login?redirectTo=%2Fmypage");

  await expect(page.locator('a[href="/signup?redirectTo=%2Fmypage"]')).toBeVisible();
  await expect(
    page.locator('a[href="/forgot-password?redirectTo=%2Fmypage"]'),
  ).toBeVisible();
});

test("signup page preserves redirectTo in the login link", async ({ page }) => {
  await page.goto("/signup?redirectTo=%2Fmypage");

  // 폰에서는 머리 줄의 뒤로가기(「로그인으로」)도 로그인으로 간다(5414f18). 로그인으로 가는 길은 모두 돌아갈 곳을 들고 간다.
  await expect(page.getByRole("link", { name: "이미 계정이 있다면 로그인" })).toHaveAttribute("href", "/login?redirectTo=%2Fmypage");
  for (const link of await page.locator('a[href^="/login"]').all()) {
    await expect(link).toHaveAttribute("href", "/login?redirectTo=%2Fmypage");
  }
});

/*
  머리 줄에서 나가는 길. 인증 화면은 AuthPageShell 분할 레이아웃이라 <header>가 없다.
  넓은 화면은 왼쪽 패널의 로고(「하루컷 홈」)가 처음 화면으로 간다. 폰은 로고 대신 뒤로가기 + 가운데 제목이다
  (5414f18 「로그인·가입 화면을 폰에서는 뒤로가기 + 가운데 제목으로」) — 로그인은 처음 화면으로, 가입·비밀번호 찾기는 로그인으로.
*/
const AUTH_EXITS = [
  { route: "/login", mobile: { name: "처음 화면으로", url: /\/$/ } },
  { route: "/signup", mobile: { name: "로그인으로", url: /\/login$/ } },
  { route: "/forgot-password", mobile: { name: "로그인으로", url: /\/login$/ } },
];
for (const { route, mobile } of AUTH_EXITS) {
  test(`header link on ${route} leaves the auth screen`, async ({ page, isMobile }) => {
    await page.goto(route);
    if (isMobile) {
      await page.getByRole("link", { name: mobile.name, exact: true }).click();
      await expect(page).toHaveURL(mobile.url);
    } else {
      await page.getByRole("link", { name: "하루컷 홈" }).click();
      await expect(page).toHaveURL(/\/$/);
    }
  });
}
