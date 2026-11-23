import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { test } from "./fixtures/safariContext";
import { installCanvasCamera, shootUntilSelect, storedDraftShotCount } from "./fixtures/canvasCamera";

/*
  비회원은 API 없이 찍고, 기기에서 만들고, 같은 JPEG 를 몇 번이고 받는다 — Safari(WebKit) 포함.

  예전에는 IndexedDB 에 촬영본을 심고 결과 화면을 열었다. 비회원이 찍던 사진은 2026-11-15 부터 이 기기에 남지
  않아(「비회원 촬영하던 사진 관리 안 해도 될 거 같아. 지워버려」) 그 초안을 읽지 않는다. 그래서 캔버스 카메라로
  실제로 찍는다(fixtures/canvasCamera.ts). 저장하면 단추 줄 위에 「사진을 저장했어요 · 처음으로」가 뜨고, 단추는
  그대로라 다시 저장도 같은 단추다(「저장 누르면 사진이 저장되었어요. 홈으로 가기 이런 거」, 「버튼 크기 달라지고」).
*/
test("비회원은 API 없이 결과를 만들고 같은 JPEG를 반복 다운로드한다", async ({ page }, info) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname === "api.harucut.com" || url.hostname.endsWith(".amazonaws.com")) {
      apiRequests.push(request.url());
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  await installCanvasCamera(page);
  await page.goto("/");
  await page.getByRole("link", { name: "가입 없이 체험하기", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "이 프레임으로 찍기" })).toBeVisible();
  expect(apiRequests).toEqual([]);
  await expect(page.getByText("BEST", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "이 프레임으로 찍기", exact: true }).click();
  await page.getByRole("button", { name: "카메라 켜기", exact: true }).click();
  await page.getByRole("button", { name: "찍기 시작", exact: true }).click();
  await shootUntilSelect(page);
  // 비회원이 찍은 사진은 이 기기에 남기지 않는다.
  expect(await storedDraftShotCount(page)).toBe(0);

  for (let index = 1; index <= 4; index++) {
    await page.getByRole("button", { name: `${index}번 사진 선택`, exact: true }).click();
  }
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  await page.waitForURL(/\/create\/result$/);

  const save = page.getByRole("link", { name: "사진 저장", exact: true });
  await expect(save).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("비회원 체험 결과 안내")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /공유|사진에 저장/ })).toHaveCount(0);
  const href = await save.getAttribute("href");
  expect(href).toMatch(/^data:image\/jpeg;base64,/);
  const expectedBytes = Buffer.from(href!.split(",")[1], "base64");
  // 미리보기용 Blob이 해제돼도 다운로드 주소는 파일 바이트를 독립적으로 보유한다.
  await page.getByRole("img", { name: "완성된 네컷 결과" }).evaluate((image: HTMLImageElement) => {
    URL.revokeObjectURL(image.src);
  });

  // 단추는 저장한 뒤에도 그대로다 — 다시 저장도 같은 단추다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const completed = page.waitForEvent("download");
    await save.click();
    const download = await completed;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    const bytes = await readFile((await download.path())!);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.equals(expectedBytes)).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // 저장하면 단추 줄 위에 저장했다는 말과 처음으로 가는 길이 뜬다.
    await expect(page.getByText("사진을 저장했어요", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "처음으로", exact: true })).toHaveAttribute("href", "/");
    expect(await save.getAttribute("href")).toBe(href);
  }
  // iPhone 다운로드 확인창을 닫을 때까지 파일 주소가 유효해야 한다.
  expect(await page.evaluate(async (url) => (await fetch(url!)).ok, href)).toBe(true);
  expect(apiRequests).toEqual([]);
  await page.screenshot({ path: info.outputPath("guest-result.png"), fullPage: true });
  if (process.env.HARUCUT_REVIEW_SCREENS === "1") {
    const preview = await page.screenshot({ type: "jpeg", quality: 55 });
    console.log(`HARUCUT_SCREENSHOT ${info.project.name}-guest-result ${preview.toString("base64")}`);
  }
});
