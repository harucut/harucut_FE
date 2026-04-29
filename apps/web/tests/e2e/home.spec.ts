import { expect, test } from "@playwright/test";

test("landing page renders the public entry links", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  await expect(page.getByRole("link", { name: "회원가입" })).toBeVisible();
  await expect(page.getByRole("button", { name: "체험하기" })).toBeVisible();
});
