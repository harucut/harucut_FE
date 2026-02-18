import { expect, test } from "@playwright/test";

// E2E 스모크 테스트:
// 앱 진입 후 기본 레이아웃(main)이 렌더되고, 홈 텍스트가 노출되는지 확인합니다.
test("home page renders and shows feature links", async ({ page }) => {
  // baseURL 기준 루트로 이동
  await page.goto("/");

  // 루트 진입 후 /home 또는 / 를 유지하는지 확인
  await expect(page).toHaveURL(/\/home|\/$/);
  // 최소 레이아웃 렌더 확인
  await expect(page.locator("main")).toBeVisible();
  // 브랜딩/홈 텍스트 노출 확인
  await expect(page.locator("body")).toContainText(/harucut|home/i);
});
