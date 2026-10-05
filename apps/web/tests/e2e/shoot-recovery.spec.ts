import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("촬영한 컷은 앱 전환과 문서 재시작 뒤에도 이어서 쓴다", async ({ page, baseURL }, testInfo) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
    else await dialog.dismiss();
  });
  await page.context().addCookies([{ name: "harucut_guest_trial", value: "1", url: baseURL! }]);
  await page.goto("/shoot");
  await page.getByRole("button", { name: "촬영 시작하기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
  await page.getByRole("button", { name: "바로 촬영", exact: true }).click();
  await expect(page.getByLabel(/8컷 중 [1-8]컷 촬영됨/)).toBeVisible();

  // 실제 카메라 결과를 저장했는지 기다린다. 테스트가 스토어나 보관물을 만들어 넣지 않는다.
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("harucut-shoot-session", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("session").objectStore("session").get("meta");
      read.onsuccess = () => { resolve(read.result?.shotKeys?.length ?? 0); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
  }))).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.goto("/shoot"); // 새 문서: 메모리 상태를 잃고 IndexedDB에서 복원한다.
  await expect(page.getByRole("button", { name: "이어서 만들기" })).toBeVisible();
  await page.getByRole("button", { name: "이어서 만들기" }).click();
  await expect(page).toHaveURL(/\/shoot\/capture$/);
  const camera = page.getByRole("button", { name: "카메라 켜기", exact: true });
  const resume = page.getByRole("button", { name: "이어서 찍기", exact: true });
  // 권한을 허용한 브라우저는 문서가 다시 열리면 카메라를 자동으로 시작한다.
  await expect(camera.or(resume)).toBeVisible();
  if (await camera.isVisible()) await camera.click();
  await expect(resume).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("capture-restored.png"), fullPage: true });
});
