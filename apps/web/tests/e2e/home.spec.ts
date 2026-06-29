import { expect, test } from "@playwright/test";

test("landing page renders the public entry links", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /하루를 촬영해요/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "지금 시작하기" }),
  ).toBeVisible();
});
