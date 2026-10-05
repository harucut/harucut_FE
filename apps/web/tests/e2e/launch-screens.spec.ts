import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

async function recordScreen(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  // 원본은 artifact에 보관한다. 선택한 CI에서만 첫 화면도 로그로 전달해
  // artifact 파일을 직접 열 수 없는 검토 환경에서 실제 픽셀을 확인한다.
  if (process.env.HARUCUT_REVIEW_SCREENS === "1") {
    const preview = await page.screenshot({ type: "jpeg", quality: 55 });
    console.log(`HARUCUT_SCREENSHOT ${info.project.name}-${name} ${preview.toString("base64")}`);
  }
}

for (const theme of ["light", "dark"] as const) {
  test(`출시 화면 ${theme}: 렌더 오류·가로 넘침과 실제 화면 기록`, async ({ page, baseURL }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((value) => localStorage.setItem("harucut-web-color-theme", value), theme);
    for (const route of ["/", "/features"]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await recordScreen(page, testInfo, `${theme}-${route === "/" ? "landing" : "features"}`);
    }
    await stubAuthenticatedApi(page);
    await page.context().addCookies([{ name: "accessToken", value: "launch-qa", url: baseURL! }]);
    await page.goto("/theme");
    await page.getByRole("button", { name: "새 프레임 만들기" }).click();
    await expect(page).toHaveURL(/\/theme\/sticker$/);
    await expect(page.locator("canvas").first()).toBeVisible();
    await recordScreen(page, testInfo, `${theme}-editor`);
    expect(errors).toEqual([]);
  });
}
