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
 * 접근성 스캔은 "다 자리잡은 화면"을 봐야 한다.
 *
 * 등장 애니메이션(.hc-reveal)은 opacity를 0에서 1로 0.6초 동안 올린다. 재생 중에 axe가
 * 스캔하면 반투명 글자색이 배경과 섞여 계산돼, 실제 디자인과 무관한 대비 위반이 잡힌다
 * (히어로 문단이 #B3B3B3 대신 배경과 섞인 어두운 색으로 측정되던, 느린 CI 러너 전용 간헐 실패).
 *
 * 스타일을 직접 주입해 최종 상태로 고정한다. Playwright의 `reducedMotion: "reduce"` emulation은
 * 이 설정에서 페이지에 닿지 않아(matchMedia가 계속 false) 쓸 수 없었다.
 * 전환·애니메이션 시간을 0으로 눌러 두면 스캔 중에 색이 바뀌는 일도 없다.
 */
const FREEZE_ANIMATIONS_CSS = `
  *, *::before, *::after {
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
  .hc-reveal {
    opacity: 1 !important;
    transform: none !important;
  }
`;

// 온보딩 코치마크(components/onboarding/CoachMarks.tsx)는 마운트 350ms 뒤에 뜬다.
// 그 전에 스캔하면 어떤 실행에서는 검사되고 어떤 실행에서는 빠져서, 느린 CI에서만
// 위반이 잡히는 일이 생긴다(실제로 /home 말풍선 대비 미달이 그렇게 드러났다).
// 뜰 화면에서는 뜬 뒤에 검사하도록 그 지연을 넘겨 기다린다.
const COACH_MARK_DELAY_MS = 350;

async function expectNoAccessibilityViolations(page: Page) {
  await page.locator("body").waitFor({ state: "visible" });
  await page.addStyleTag({ content: FREEZE_ANIMATIONS_CSS });
  await page.waitForTimeout(COACH_MARK_DELAY_MS + 150);

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
