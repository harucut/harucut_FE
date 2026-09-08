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

  await expect(page.locator('a[href="/login?redirectTo=%2Fmypage"]')).toBeVisible();
});

for (const route of ["/login", "/signup", "/forgot-password"]) {
  test(`brand link on ${route} returns to the landing page`, async ({ page }) => {
    await page.goto(route);
    // 인증 화면은 AuthPageShell 분할 레이아웃이라 <header>가 없다. 브랜드 로고(BrandMark)는
    // 데스크톱 좌측 패널과 모바일 상단에 각각 있고 뷰포트에 따라 하나만 보이므로,
    // 접근성 이름으로 실제 보이는 링크를 집는다.
    await page.getByRole("link", { name: "Harucut home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}
