import { expect, test } from "@playwright/test";

test("landing page visual baseline", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").waitFor({ state: "visible" });
  await page
    .locator(
      'img[alt="다양한 친구들이 야외에서 셀카를 찍는 네 컷 프레임 예시"]',
    )
    .waitFor({ state: "visible" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(page).toHaveScreenshot("landing-page.png", {
    fullPage: true,
  });
});
