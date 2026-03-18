import { expect, test } from "@playwright/test";

test("landing page renders the public entry links", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator('a[href="/home"]')).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
  await expect(page.locator('a[href="/signup"]')).toBeVisible();
});
