import { expect, test, type Page } from "@playwright/test";
import { stubAuthenticatedApi } from "./fixtures/apiStub";

/**
 * 편집 초안은 계정 × 프레임 종류마다 따로 둔다(lib/themeEditorDraft.ts) —
 * `harucut:theme-editor-draft:v2:{계정 id}:{frameId}`. 계정 id 는 스텁(fixtures/apiStub.ts)이,
 * frameId 는 「새 프레임 만들기」가 고른 판형이 정하므로 접두사로 찾는다.
 */
const DRAFT_PREFIX = "harucut:theme-editor-draft:v2:";

function readDraftBackground(prefix: string) {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      return JSON.parse(localStorage.getItem(key) ?? "null")?.backgroundColor ?? null;
    }
  }
  return null;
}

/**
 * 모바일 편집 화면은 도구를 하나씩 하단 시트로 연다 — 배경 패널은 「배경」 도구를 골라야 보인다.
 * 데스크톱에는 도구 막대가 없고 패널이 모두 보인다.
 */
async function openBackgroundTool(page: Page) {
  // 편집 화면이 그려진 뒤에 판단한다 — 그리기 전에 보면 모바일에서도 막대가 없다고 읽는다.
  await expect(page.locator("canvas").first()).toBeVisible();
  const tools = page.getByRole("navigation", { name: "편집 도구" });
  if (await tools.isVisible()) await tools.getByRole("button", { name: "배경" }).click();
}

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
  await openBackgroundTool(page);
  await page.getByRole("button", { name: "스튜디오 그린", exact: true }).click();
  await expect
    .poll(() => page.evaluate(readDraftBackground, DRAFT_PREFIX))
    .toBe("1ed760");

  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  // 판형은 메모리 세션이라 새로고침 뒤 목록에서 다시 고른다.
  await expect(page).toHaveURL(/\/theme$/);
  await page.getByRole("button", { name: "새 프레임 만들기" }).click();
  await expect(page).toHaveURL(/\/theme\/sticker$/);
  await openBackgroundTool(page);
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
  await openBackgroundTool(page);
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
  expect(await page.evaluate(readDraftBackground, DRAFT_PREFIX)).toBeNull();
});
