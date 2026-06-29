import { expect, test } from "@playwright/test";

test("landing primary CTA routes unauthenticated users to login", async ({ page }) => {
  await page.goto("/");
  // 로그인 우선: 우측 상단 primary CTA '지금 시작하기'가 /login으로 간다.
  await page.getByRole("link", { name: "지금 시작하기" }).click();

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
    await page.locator('header a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
  });
}
