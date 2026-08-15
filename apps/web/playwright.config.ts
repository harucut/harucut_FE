import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  // e2e 서버는 `next dev`라 라우트를 처음 열 때 그 자리에서 컴파일한다. CI 러너에서는
  // 워커 두 개가 서로 다른 라우트를 동시에 처음 열면 이 컴파일이 30초를 넘겨 page.goto가
  // 타임아웃난다(제품 문제가 아니라 첫 컴파일 대기). CI에서만 여유를 준다.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm dev --webpack --hostname localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // 로컬 .env.local 에 개발용 로그인 우회가 켜져 있어도 e2e 서버에서는 끈다.
      // 켜진 채로 돌면 인증 가드 테스트가 통째로 무의미해진다.
      NEXT_PUBLIC_DEV_AUTH_BYPASS: "0",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
