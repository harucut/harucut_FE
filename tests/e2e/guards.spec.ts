import { expect, test } from "@playwright/test";

// 가드 테스트:
// 세션 상태 없이 보호 페이지로 진입하면 지정된 시작 페이지로 되돌아가야 합니다.

test("redirects /shoot/capture to /shoot when frame is not selected", async ({
  page,
}) => {
  await page.goto("/shoot/capture");
  await expect(page).toHaveURL(/\/shoot$/);
});

test("redirects /upload/select to /upload when frame is not selected", async ({
  page,
}) => {
  await page.goto("/upload/select");
  await expect(page).toHaveURL(/\/upload$/);
});

test("redirects /theme/sticker to /theme when frame is not selected", async ({
  page,
}) => {
  await page.goto("/theme/sticker");
  await expect(page).toHaveURL(/\/theme$/);
});

