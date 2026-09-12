import { expect, test } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

const DRAFT_KEY = "harucut:theme-editor-draft:v1";

test.beforeEach(async ({ page, baseURL }) => {
  await page.clock.install();
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

test("배경색만 바꾼 초안도 새로고침 후 복원한다", async ({ page }, testInfo) => {
  await page.getByRole("button", { name: "스튜디오 그린", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const draft = localStorage.getItem(key);
        return draft ? JSON.parse(draft).backgroundColor : null;
      }, DRAFT_KEY),
    )
    .toBe("1ed760");

  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  // 판형은 메모리 세션이라 새로고침 뒤 목록에서 다시 고른다.
  await expect(page).toHaveURL(/\/theme$/);
  await page.getByRole("button", { name: "새 프레임 만들기" }).click();
  await expect(
    page.getByRole("button", { name: "스튜디오 그린", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: testInfo.outputPath("draft-restored.png"),
    fullPage: true,
  });
});

test("저장 실패는 안내하고 다시 저장한 뒤에는 초안이 남지 않는다", async ({
  page,
}, testInfo) => {
  let saves = 0;
  await page.route("**/api/client/user/frame", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    saves += 1;
    return route.fulfill(
      saves === 1
        ? { status: 502, json: { code: "CLIENT-003", status: 502 } }
        : {
            status: 200,
            json: {
              code: "GEN-000",
              status: 200,
              data: { ...route.request().postDataJSON(), frameId: 701 },
            },
          },
    );
  });
  await page.getByRole("button", { name: "스튜디오 그린", exact: true }).click();
  await page
    .locator("header")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "프레임 저장" });
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByText(/서버에 연결하지 못했어요/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "저장", exact: true })).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("save-error.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page).toHaveURL(/\/theme$/);
  expect(saves).toBe(2);
  // 예약된 자동 저장과 비동기 변환이 뒤늦게 초안을 되살리는지 본다.
  await page.clock.fastForward(5_000);
  expect(await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
});
