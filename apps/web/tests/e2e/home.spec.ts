import { GUEST_TRIAL_CTA_LABEL } from "@harucut/shared";
import { expect, test } from "@playwright/test";

test("landing page renders the public entry links", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /하루를 촬영해요/ }),
  ).toBeVisible();
  /*
    첫 화면의 들어가는 길 둘. 좁은 화면에서는 헤더의 "지금 시작하기"를 숨기므로
    (같은 행동이 세 번 놓이고 초록이 세 곳에 흩어졌다) 히어로의 두 CTA 가 계약이다.
  */
  await expect(
    page.getByRole("button", { name: GUEST_TRIAL_CTA_LABEL }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
});

test("keeps the header CTA on wide screens only", async ({ page }) => {
  const headerCta = page.getByRole("link", { name: "지금 시작하기" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  // 좁은 화면: 헤더에 자리가 없다. 넣으면 내비가 두 줄이 돼 헤더가 113px 이 된다.
  await expect(headerCta).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(headerCta).toBeVisible();
});
