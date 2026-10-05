import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("촬영한 컷은 앱 전환과 문서 재시작 뒤에도 이어서 쓴다", async ({ page }, testInfo) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
    else await dialog.dismiss();
  });
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname === "api.harucut.com") apiRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("link", { name: "가입 없이 체험하기", exact: true }).first().click();
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

  // 여행 중 통신이 끊겨도 촬영을 이어 가고, 연결이 돌아오면 결과를 저장한다.
  await page.context().setOffline(true);
  await resume.click();
  const count = async () => Number((await page.getByLabel(/8컷 중 \d+컷 촬영됨/).getAttribute("aria-label"))?.match(/중 (\d+)컷/)?.[1]);
  while (await count() < 4) {
    const previous = await count();
    await page.getByRole("button", { name: "바로 촬영", exact: true }).click();
    await expect.poll(count).toBeGreaterThan(previous);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "찍은 사진 고르기", exact: true }).click();
  for (let index = 1; index <= 4; index++) {
    await page.getByRole("button", { name: `${index}번 사진 선택`, exact: true }).click();
  }
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  const downloadButton = page.getByRole("link", { name: "다운로드", exact: true });
  await expect(downloadButton).toBeVisible({ timeout: 15_000 });
  const completed = page.waitForEvent("download");
  await downloadButton.click();
  const download = await completed;
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(apiRequests).toEqual([]);
});
