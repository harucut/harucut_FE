import { expect } from "@playwright/test";
import { test } from "./fixtures/safariContext";
import { readFile } from "node:fs/promises";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

const envelope = (data: unknown) => ({ code: "GEN-000", status: 200, data });

test("운영 기본 프레임 누락: 회원 업로드부터 실제 JPEG 다운로드까지 복구", async ({ page, baseURL }, info) => {
  await stubAuthenticatedApi(page);
  await page.context().addCookies([{ name: "accessToken", value: "qa-member", url: baseURL! }]);
  await page.route("**/api/client/user/frame", (route) => route.fulfill({ json: envelope([]) }));
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/client/")) writes.push(new URL(request.url()).pathname);
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/shoot?source=upload");
  await page.getByRole("button", { name: "사진 고르러 가기", exact: true }).click();
  const buffer = await readFile("public/demo/cut-1.webp");
  await page.locator('input[type="file"]').setInputFiles([1, 2, 3, 4].map((n) => ({ name: `qa-${n}.webp`, mimeType: "image/webp", buffer })));
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  for (const n of [4, 2, 3, 1]) await page.getByRole("button", { name: `${n}번 사진 선택`, exact: true }).click();
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  const downloadLink = page.getByRole("link", { name: "다운로드", exact: true });
  await expect(downloadLink).toBeVisible();
  await expect(page.getByRole("status")).toContainText("계정 기록에 보관할 수 없어요");
  await expect(page.getByRole("button", { name: "공유 링크 만들기" })).toHaveCount(0);
  await page.getByLabel("파일 이름").fill("POC-기기저장");
  await page.getByRole("button", { name: "파일명 수정" }).click();
  const completed = page.waitForEvent("download");
  await downloadLink.click();
  const download = await completed;
  // macOS WebKit은 파일명의 한글을 분해형으로 돌려줄 수 있다.
  expect(download.suggestedFilename().normalize("NFC")).toBe("POC-기기저장.jpg");
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  expect(bytes.length).toBeGreaterThan(10_000);
  expect(writes).toEqual([]); // 원본 업로드·합성·이름 변경 API를 호출하지 않는다.
  await page.screenshot({ path: info.outputPath("member-local-result.png"), fullPage: true });
  await page.reload();
  await expect(downloadLink).toBeVisible();
  await expect(page.getByRole("status")).toContainText("계정 기록에 보관할 수 없어요");
  expect(writes).toEqual([]);
});

test("빈 활성 약관은 체험으로 안내하고 재조회가 성공하면 가입 폼을 연다", async ({ page }, info) => {
  let registered = false;
  await page.route("**/api/client/terms", (route) => route.fulfill({ json: envelope(registered ? [
    { code: "terms", title: "서비스 이용약관", required: true, version: 1, content: "POC 약관 본문" },
  ] : []) }));
  await page.goto("/signup?redirectTo=%2Fhistory");
  await expect(page.getByText(/회원가입을 잠시 이용할 수 없어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "회원가입", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "가입 없이 체험하기" })).toHaveAttribute("href", "/shoot/start");
  await page.screenshot({ path: info.outputPath("signup-unavailable.png"), fullPage: true });
  registered = true;
  await page.getByRole("button", { name: "다시 확인하기" }).click();
  await expect(page.getByRole("button", { name: "회원가입", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /서비스 이용약관/ })).toBeVisible();
});

test("요금제는 현재 무제한 권한과 예정 기준을 구분한다", async ({ page, baseURL }, info) => {
  await stubAuthenticatedApi(page);
  await page.context().addCookies([{ name: "accessToken", value: "qa-member", url: baseURL! }]);
  await page.route("**/api/client/user/subscription/usage", (route) => route.fulfill({ json: envelope({
    planTier: "BASIC", frameRetentionLimit: -1, frameRetentionUsedCount: 1,
    frameRetentionRemainingCount: -1, frameRetentionUnlimited: true,
  }) }));
  await page.goto("/pricing");
  await expect(page.getByRole("region", { name: "현재 프레임 보관 한도" })).toContainText("무료 · 1개 보관 / 무제한");
  await expect(page.getByRole("heading", { name: "개인 요금제 · 도입 예정 기준" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("pricing-actual-usage.png"), fullPage: true });
});
