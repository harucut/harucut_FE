import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  `http://localhost:${Number(process.env.PORT ?? 3000)}`;

const publicRoutes = ["/", "/login", "/signup", "/forgot-password"] as const;
const authenticatedRoutes = [
  "/home",
  "/shoot",
  "/upload",
  "/theme",
  "/history",
  "/mypage",
] as const;

async function enableAuthenticatedContext(
  page: Parameters<typeof test>[0]["page"],
) {
  await page.context().addCookies([
    {
      name: "accessToken",
      value: "a11y-session",
      url: baseURL,
    },
  ]);
}

async function expectNoAccessibilityViolations(
  page: Parameters<typeof test>[0]["page"],
) {
  await page.locator("body").waitFor({ state: "visible" });

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
