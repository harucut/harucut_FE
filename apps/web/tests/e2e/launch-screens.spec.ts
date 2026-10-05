import { expect, test } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

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
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${route === "/" ? "landing" : "features"}.png`), fullPage: true });
    }
    await stubAuthenticatedApi(page);
    await page.context().addCookies([{ name: "accessToken", value: "launch-qa", url: baseURL! }]);
    await page.goto("/theme");
    await page.getByRole("button", { name: "새 프레임 만들기" }).click();
    await expect(page).toHaveURL(/\/theme\/sticker$/);
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${theme}-editor.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
