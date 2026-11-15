import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { stubAuthenticatedApi } from "./fixtures/apiStub";
import { shootUntilSelect, storedDraftShotCount } from "./fixtures/canvasCamera";

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

/*
  찍던 사진을 이 기기에 남기는 것은 회원뿐이다(2026-11-15 「비회원 촬영하던 사진 관리 안 해도 될 거 같아. 지워버려 /
  그러면 당연히 새로 시작 화면도 없어져야겠지?」, lib/shootSessionPersistence.ts).
    - 회원: 앱 전환·문서 재시작 뒤에도 「촬영하던 사진이 있어요」로 이어서 찍는다.
    - 비회원: 이 기기에 쓰지 않는다. 문서를 다시 열면 묻지 않고 새 촬영이다.
*/

test("회원이 찍은 컷은 앱 전환과 문서 재시작 뒤에도 이어서 쓴다", async ({ page, baseURL }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
    else await dialog.dismiss();
  });
  await stubAuthenticatedApi(page);
  await page.context().addCookies([{ name: "accessToken", value: "qa-member", url: baseURL! }]);
  await page.goto("/create");
  await page.getByRole("button", { name: "이 프레임으로 찍기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await page.getByRole("button", { name: "찍기 시작", exact: true }).click();
  await page.getByRole("button", { name: "바로 찍기", exact: true }).click();
  await expect(page.getByLabel(/8컷 중 [1-8]컷 촬영됨/)).toBeVisible();

  // 실제 카메라 결과를 저장했는지 기다린다. 테스트가 스토어나 보관물을 만들어 넣지 않는다.
  await expect.poll(() => storedDraftShotCount(page)).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.goto("/create"); // 새 문서: 메모리 상태를 잃고 IndexedDB에서 복원한다.
  await expect(page.getByRole("heading", { name: "촬영하던 사진이 있어요" })).toBeVisible();
  await page.getByRole("button", { name: "이어서 만들기" }).click();
  await expect(page).toHaveURL(/\/create\/capture$/);
  const camera = page.getByRole("button", { name: "카메라 켜기", exact: true });
  const resume = page.getByRole("button", { name: "이어서 찍기", exact: true });
  // 권한을 허용한 브라우저는 문서가 다시 열리면 카메라를 자동으로 시작한다.
  await expect(camera.or(resume)).toBeVisible();
  if (await camera.isVisible()) await camera.click();
  await expect(resume).toBeVisible();
});

test("비회원이 찍은 컷은 이 기기에 남지 않고, 통신이 끊겨도 끝까지 만들어 받는다", async ({ page }, testInfo) => {
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
  await page.getByRole("button", { name: "이 프레임으로 찍기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await page.getByRole("button", { name: "찍기 시작", exact: true }).click();
  await page.getByRole("button", { name: "바로 찍기", exact: true }).click();
  await expect(page.getByLabel(/8컷 중 [1-8]컷 촬영됨/)).toBeVisible();
  // 한 컷 찍고 잠시 기다려도 이 기기에는 아무것도 쓰지 않는다.
  await page.waitForTimeout(1_000);
  expect(await storedDraftShotCount(page)).toBe(0);

  // 새 문서: 비회원에게는 「촬영하던 사진이 있어요」도 「새로 시작하기」도 없다 — 바로 프레임 고르기다.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.goto("/create");
  await expect(page.getByRole("button", { name: "이 프레임으로 찍기", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "촬영하던 사진이 있어요" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "새로 시작하기" })).toHaveCount(0);

  // 여행 중 통신이 끊겨도 처음부터 찍어 끝까지 만든다.
  await page.getByRole("button", { name: "이 프레임으로 찍기", exact: true }).click();
  const camera = page.getByRole("button", { name: "카메라 켜기", exact: true });
  const start = page.getByRole("button", { name: "찍기 시작", exact: true });
  await expect(camera.or(start)).toBeVisible();
  if (await camera.isVisible()) await camera.click();
  await page.context().setOffline(true);
  await start.click();
  await shootUntilSelect(page);
  for (let index = 1; index <= 4; index++) {
    await page.getByRole("button", { name: `${index}번 사진 선택`, exact: true }).click();
  }
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  const downloadButton = page.getByRole("link", { name: "사진 저장", exact: true });
  await expect(downloadButton).toBeVisible({ timeout: 15_000 });
  const completed = page.waitForEvent("download");
  await downloadButton.click();
  const download = await completed;
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeGreaterThan(10_000);
  await page.context().setOffline(false);
  await page.screenshot({ path: testInfo.outputPath("guest-offline-result.png"), fullPage: true });
  expect(apiRequests).toEqual([]);
});
