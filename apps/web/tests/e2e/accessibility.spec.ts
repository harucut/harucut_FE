import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${Number(process.env.PORT ?? 3000)}`;

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/pricing",
  "/faq",
  "/features",
  "/terms",
  "/privacy",
] as const;
const authenticatedRoutes = [
  "/home",
  "/shoot",
  "/upload",
  "/theme",
  "/history",
  "/mypage",
] as const;

async function enableAuthenticatedContext(page: Page) {
  await page.context().addCookies([
    {
      name: "accessToken",
      value: "a11y-session",
      url: baseURL,
    },
  ]);
}

/**
 * 등장 애니메이션(.hc-reveal)이 다 끝났는지 기다린다.
 *
 * .hc-reveal은 opacity 0에서 1로 0.6s 동안 페이드인하고, 인라인 transition-delay로 스태거까지
 * 걸린다. 재생 중에 axe가 스캔하면 반투명 상태의 글자색이 배경과 섞여 계산돼, 실제 디자인과
 * 무관한 대비 위반이 잡힌다(느린 CI 러너에서만 간헐적으로 터지던 원인 — 히어로 문단이
 * #B3B3B3 대신 배경과 섞인 어두운 색으로 측정됐다).
 *
 * 뷰포트 밖 요소는 IntersectionObserver가 아직 발화하지 않아 opacity 0으로 남아 있고 axe도
 * 보이지 않는 것으로 취급하므로, "재생 중(0 < opacity < 1)인 요소가 하나도 없을 때"를 기다린다.
 */
async function waitForRevealAnimations(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".hc-reveal")).every((el) => {
      const opacity = Number(window.getComputedStyle(el).opacity);
      return opacity === 0 || opacity === 1;
    }),
  );
}

async function expectNoAccessibilityViolations(page: Page) {
  await page.locator("body").waitFor({ state: "visible" });
  await waitForRevealAnimations(page);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
}

for (const route of publicRoutes) {
  test(`public route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);

    await expectNoAccessibilityViolations(page);
  });
}

for (const route of authenticatedRoutes) {
  test(`authenticated route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    await enableAuthenticatedContext(page);
    await page.goto(route);

    await expectNoAccessibilityViolations(page);
  });
}
