import { expect, test } from "@playwright/test";

test("landing CTA routes unauthenticated users to login with redirectTo", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('a[href="/home"]').click();

  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("redirectTo"))
    .toBe("/home");
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
