import { expect } from "@playwright/test";
import { test } from "./fixtures/safariContext";
import { readFile } from "node:fs/promises";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

const envelope = (data: unknown) => ({ code: "GEN-000", status: 200, data });

/*
  회원 사진은 언제나 서버가 만들어 기록에 남긴다(2026-11-15 「기기 저장만 가능은 대체 뭐」). 예전 이 시험은 서버에
  기본 프레임이 없을 때 기기에서 만들어 「이 사진은 기록에 보관되지 않아요」로 내려받는 폴백을 봤다 — 기본 프레임은
  백엔드가 늘 갖도록 보장하고 그 폴백은 걷었다. 이름은 꾸미기에서 붙이고(완성 화면에는 이름 바꾸기가 없다), 서버가
  붙인 날짜 이름을 다 된 뒤 그 이름으로 바꾼다.
*/
test("회원 업로드부터 서버가 만든 사진을 꾸미기 이름으로 받기까지", async ({ page, baseURL }, info) => {
  await stubAuthenticatedApi(page);
  await page.context().addCookies([{ name: "accessToken", value: "qa-member", url: baseURL! }]);
  // 막 만든 기록은 서버가 붙인 날짜 이름이다 — 그래야 꾸미기 이름으로 바꾼다(이미 바꾼 기록은 건드리지 않는다).
  await page.route(
    (url) => url.pathname === "/api/client/user/media",
    (route) => route.fulfill({ json: envelope([{ mediaId: 9100, s3Key: "uploads/users/a11y/result.webp", displayName: "harucut_20261115_143000", createdAt: "2026-11-15T14:30:00.000000" }]) }),
  );
  const renamed: string[] = [];
  await page.route("**/api/client/user/media/9100/display-name", (route) => {
    const { displayName } = route.request().postDataJSON() as { displayName: string };
    renamed.push(displayName);
    return route.fulfill({ json: envelope({ mediaId: 9100, s3Key: "uploads/users/a11y/result.webp", displayName, createdAt: "2026-11-15T14:30:00.000000" }) });
  });
  const composed: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/client/user/media/compose") composed.push(request.url());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/create?source=upload");
  await page.getByRole("button", { name: "사진 고르러 가기", exact: true }).click();
  // 불러오기는 따로 화면이 없다 — 사진 고르기 화면의 「사진 불러오기」 칸으로 불러온다(2026-11-15).
  await page.waitForURL(/\/create\/select$/);
  await expect(page.getByRole("button", { name: "사진 불러오기", exact: true })).toBeVisible();
  const buffer = await readFile("public/demo/cut-1.webp");
  await page.locator('input[type="file"]').setInputFiles([1, 2, 3, 4, 5].map((n) => ({ name: `qa-${n}.webp`, mimeType: "image/webp", buffer })));
  // 앨범에서 골라 온 사진은 빈 칸부터 차례로 들어간다 — 네 장을 다시 누르지 않는다.
  await expect(page.getByRole("button", { name: "4번 사진 선택 해제 (현재 4번째로 선택됨)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "5번 사진 — 4장을 다 골라 더 선택할 수 없어요", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "꾸미기", exact: true }).click();
  await page.getByLabel("사진 이름", { exact: true }).fill("POC-회원");
  await page.getByRole("button", { name: "다음 단계로", exact: true }).click();
  const save = page.getByRole("button", { name: "사진 저장", exact: true });
  await expect(save).toBeVisible();
  expect(composed).toHaveLength(1);
  expect(renamed).toEqual(["POC-회원"]);
  await expect(page.getByText(/기록에 보관되지 않아요/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "공유", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "더보기", exact: true })).toHaveCount(0);
  const completed = page.waitForEvent("download");
  await save.click();
  const download = await completed;
  // macOS WebKit은 파일명의 한글을 분해형으로 돌려줄 수 있다.
  expect(download.suggestedFilename().normalize("NFC")).toMatch(/^POC-회원\.(webp|jpe?g|png)$/);
  expect(await download.failure()).toBeNull();
  await page.screenshot({ path: info.outputPath("member-server-result.png"), fullPage: true });
});

test("빈 활성 약관은 체험으로 안내하고 재조회가 성공하면 가입 폼을 연다", async ({ page }, info) => {
  let registered = false;
  await page.route("**/api/client/terms", (route) => route.fulfill({ json: envelope(registered ? [
    { code: "terms", title: "서비스 이용약관", required: true, version: 1, content: "POC 약관 본문" },
  ] : []) }));
  await page.goto("/signup?redirectTo=%2Fhistory");
  await expect(page.getByText(/회원가입을 잠시 이용할 수 없어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "회원가입", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "가입 없이 체험하기" })).toHaveAttribute("href", "/create/start");
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
