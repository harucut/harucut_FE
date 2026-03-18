import { expect, test } from "@playwright/test";

const protectedRoutes = [
  "/home",
  "/shoot",
  "/shoot/capture",
  "/upload",
  "/upload/select",
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
