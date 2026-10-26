import { expect, test } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

/**
 * 모바일 편집 화면은 캔버스를 화면에 둔 채 도구를 하단 시트로 연다(기획 R5 5절).
 * 예전에는 패널이 캔버스 아래로 쌓여, 속성을 고치려면 캔버스를 화면 밖으로 밀어내야 했다.
 */
test.beforeEach(async ({ page, baseURL }) => {
  await stubAuthenticatedApi(page);
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({
      json: { code: "GEN-000", status: 200, data: { userStatus: "ACTIVE" } },
    }),
  );
  await page
    .context()
    .addCookies([{ name: "accessToken", value: "e2e-session", url: baseURL! }]);
  await page.goto("/theme");
  await page.getByRole("button", { name: "새 프레임 만들기" }).click();
  await expect(page).toHaveURL(/\/theme\/sticker$/);
});

test("모바일에서는 도구를 하나씩 하단 시트로 열고 캔버스를 가리지 않는다", async ({ page }, testInfo) => {
  const isMobile = (page.viewportSize()?.width ?? 0) < 1024;
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();

  if (!isMobile) {
    // 데스크톱은 예전 배치 그대로 — 도구 막대가 없고 패널이 캔버스 옆에 모두 보인다.
    await expect(page.getByRole("navigation", { name: "편집 도구" })).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("editor-desktop.png"), fullPage: true });
    return;
  }

  const tools = page.getByRole("navigation", { name: "편집 도구" });
  await expect(tools).toBeVisible();
  await expect(tools.getByRole("button", { name: "추가" })).toHaveAttribute("aria-pressed", "true");

  const sheet = page.locator("#theme-editor-tool-sheet");
  const canvasBox = (await canvas.boundingBox())!;
  const sheetBox = (await sheet.boundingBox())!;
  // 캔버스 아래 끝이 시트 위 끝보다 위에 있어야 한다 — 캔버스 전체가 보인다.
  expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(sheetBox.y + 1);
  await page.screenshot({ path: testInfo.outputPath("editor-mobile-assets.png") });

  await tools.getByRole("button", { name: "배경" }).click();
  await expect(page.getByRole("button", { name: "스튜디오 그린", exact: true })).toBeVisible();
  await expect(page.getByText("아직 업로드한 사진이 없어요.")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("editor-mobile-background.png") });
});
