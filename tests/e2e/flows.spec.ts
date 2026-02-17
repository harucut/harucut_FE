import { expect, test } from "@playwright/test";

// 촬영 플로우 스모크:
// 홈 -> /shoot 진입 -> 프레임 확인 버튼 클릭 -> /shoot/capture 이동 확인
test("shoot flow moves to capture page", async ({ page }) => {
  await page.goto("/home");

  await page.locator('a[href="/shoot"]').click();
  await expect(page).toHaveURL(/\/shoot$/);

  await page.locator("button.rounded-full.bg-emerald-500").click();
  await expect(page).toHaveURL(/\/shoot\/capture$/);
});

// 업로드 플로우 스모크:
// 홈 -> /upload 진입 -> 프레임 확인 버튼 클릭 -> /upload/select 이동 확인
test("upload flow moves to select page", async ({ page }) => {
  await page.goto("/home");

  await page.locator('a[href="/upload"]').click();
  await expect(page).toHaveURL(/\/upload$/);

  await page.locator("button.rounded-full.bg-emerald-500").click();
  await expect(page).toHaveURL(/\/upload\/select$/);
});

// 꾸미기 플로우 스모크:
// 홈 -> /theme 진입 -> 프레임 확인 버튼 클릭 -> /theme/sticker 이동 확인
test("theme flow moves to sticker editor page", async ({ page }) => {
  await page.goto("/home");

  await page.locator('a[href="/theme"]').click();
  await expect(page).toHaveURL(/\/theme$/);

  await page.locator("button.rounded-full.bg-emerald-500").click();
  await expect(page).toHaveURL(/\/theme\/sticker$/);
});

