import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  // CI 는 빌드된 서버를 쓰므로 첫 컴파일 대기가 없다. 로컬(dev 서버)에서만 여유를 둔다.
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/globalSetup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    /*
      CI 에서는 빌드한 서버로 검사한다.

      예전에는 CI 도 `next dev` 를 띄웠다. dev 서버는 라우트를 처음 열 때 그 자리에서
      컴파일하는데, 찬 러너에서 워커 둘이 서로 다른 라우트를 동시에 처음 열면 그 대기가
      제한을 넘겼다. 화면을 UI 로 거쳐 들어가는 검사(업로드 4단계 → 꾸미기)는 한 번에
      라우트 네 개를 처음 여는 셈이라 3분을 줘도 모자랐다.

      제한을 늘리는 것은 원인을 늦추는 것일 뿐이고, 무엇보다 배포되는 것과 다른 빌드를
      검사하게 된다. 빌드 시간(약 1분)을 내주고 실제로 나가는 산출물을 검사한다.
      로컬은 그대로 dev 서버 — 고치고 바로 돌려보는 흐름이 빨라야 한다.
    */
    command: process.env.CI
      ? `pnpm build && pnpm start --hostname localhost --port ${port}`
      : `pnpm dev --webpack --hostname localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // 빌드까지 기다려야 하므로 CI 는 넉넉히 잡는다.
    timeout: process.env.CI ? 300_000 : 120_000,
    env: {
      // 로컬 .env.local 에 개발용 로그인 우회가 켜져 있어도 e2e 서버에서는 끈다.
      // 켜진 채로 돌면 인증 가드 테스트가 통째로 무의미해진다.
      // 프로덕션 빌드에서는 이 값이 빌드 시점에 코드로 박히므로, build 와 start 가
      // 같은 환경에서 돌아야 한다(위 command 가 한 줄로 이어져 있는 이유다).
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
