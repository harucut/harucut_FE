import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/login", "/signup", "/forgot-password"] as const;

for (const route of publicRoutes) {
  test(`public route ${route} has no obvious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
}
