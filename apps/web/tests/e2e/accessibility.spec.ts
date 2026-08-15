import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// 접근성 스캔은 "다 자리잡은 화면"을 봐야 한다. 모션이 켜져 있으면 등장 애니메이션(.hc-reveal)이
// opacity 0에서 1로 올라가는 도중에 axe가 스캔해, 반투명 글자색이 배경과 섞여 계산되면서
// 실제 디자인과 무관한 대비 위반이 잡힌다(느린 CI 러너에서만 재현되던 간헐 실패의 원인).
// prefers-reduced-motion을 켜면 globals.css가 .hc-reveal을 곧바로 최종 상태로 두고
// 필름 스트립·게이지 애니메이션도 멈춰, 매번 같은 화면을 검사하게 된다.
test.use({ reducedMotion: "reduce" });

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
 * 진행 중인 CSS 트랜지션이 없을 때까지 기다린다.
 *
 * 모션을 껐어도 색 전환(transition-colors)은 남는다. 예를 들어 HOW 필름은 첫 페인트 뒤
 * effect에서 "모션 꺼짐"을 감지해 전 단계를 밝히는데, 그 사이 0.5초짜리 색 전환이 돈다.
 * 그 중간 색을 스캔하면 또 실재하지 않는 대비 위반이 잡히므로 전환이 끝난 뒤에 검사한다.
 * (무한 반복 애니메이션은 reduced motion에서 이미 꺼져 있어 여기 걸리지 않는다)
 */
async function waitForTransitionsToSettle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((animation) => animation instanceof CSSTransition)
      .every((animation) => animation.playState !== "running"),
  );
}

async function expectNoAccessibilityViolations(page: Page) {
  await page.locator("body").waitFor({ state: "visible" });
  await waitForTransitionsToSettle(page);

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
