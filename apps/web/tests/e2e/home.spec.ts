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

test("keeps the marketing nav on one row at the narrowest phone", async ({
  page,
}) => {
  /*
    320px 은 아직 도는 가장 좁은 실기기 폭이다. 여기서 브랜드와 링크 넷이 px-7(양쪽 28px)
    안쪽에 들어가야 헤더가 한 줄로 남는다 — 아래 줄로 접히면 113px 이 되어 첫 화면의 13% 를
    내비가 먹는다. 여유가 7px 뿐이라 링크 이름이 조금만 길어져도 깨지므로 기계가 지킨다.
  */
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");

  const menu = page.getByRole("navigation", { name: "사이트 메뉴" });
  await expect(menu).toBeVisible();

  const readHeader = () =>
    page.evaluate(() => {
      const header = document.querySelector("header")!;
      const nav = header.querySelector("nav")!;
      const root = document.documentElement;
      return {
        height: header.getBoundingClientRect().height,
        navRight: nav.getBoundingClientRect().right,
        clientWidth: root.clientWidth,
        // 스크롤은 320px 아래를 위한 보험이다. 320px 에서 걸리면 넷 중 하나가 잘렸다는 뜻이다.
        navScrolls: nav.scrollWidth > nav.clientWidth + 1,
        pageScrollsSideways: root.scrollWidth > root.clientWidth + 1,
      };
    });

  const narrow = await readHeader();
  expect(narrow.navScrolls).toBe(false);
  expect(narrow.pageScrollsSideways).toBe(false);
  expect(narrow.navRight).toBeLessThanOrEqual(narrow.clientWidth - 27);

  // 한 줄 헤더는 넓은 화면과 같은 높이다. 두 줄로 접히면 여기서 갈라진다.
  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = await readHeader();
  expect(narrow.height).toBe(wide.height);
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
