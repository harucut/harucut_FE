import { expect, test } from "@playwright/test";

test("landing page visual baseline", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").waitFor({ state: "visible" });
  await page.locator('img[alt="하루컷 샘플"]').waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(page).toHaveScreenshot("landing-page.png", {
    fullPage: true,
  });
});
