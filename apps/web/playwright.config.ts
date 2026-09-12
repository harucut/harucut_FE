import { defineConfig, devices } from "@playwright/test";

/*
  e2e 전용 포트와 산출물 디렉터리.

  3000 번을 그대로 쓰면 개발자가 손으로 띄운 서버를 집어 쓰게 되는데, 그 서버는
  .env.local 의 NEXT_PUBLIC_DEV_AUTH_BYPASS=1 을 읽어 인증 가드가 꺼져 있다.
  아래 webServer.env 에서 꺼 놓은 설정이 무력화되고, 가드 스펙이 한꺼번에 빨갛게 뜬다.
  포트와 .next 디렉터리를 갈라 두면 개발 서버를 켜 둔 채로 e2e 를 돌릴 수 있다.
*/
const port = Number(process.env.PORT ?? 3100);

/** 편집-실행 루프용 dev 서버. 기본은 빌드된 서버다(아래 webServer 주석 참고). */
const USE_DEV_SERVER = process.env.E2E_DEV_SERVER === "1";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  // CI 는 빌드된 서버를 쓰므로 첫 컴파일 대기가 없다. 로컬(dev 서버)에서만 여유를 둔다.
  timeout: 60_000,
  // 빌드된 서버에는 첫 컴파일 대기가 없다. dev 서버로 돌릴 때만 여유를 준다.
  expect: { timeout: USE_DEV_SERVER ? 15_000 : 5_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/globalSetup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    /*
      로컬도 기본은 빌드된 서버다.

      예전에는 `next dev` 로 돌렸는데, dev 서버는 워커가 다른 라우트를 열면 앞서 열어 둔
      라우트 엔트리를 버린다. 그러면 아무 조작도 안 한 시험 페이지가 통째로 새로고침되고,
      진행 중이던 클릭·이동이 사라진다 — 96개 중 1~2개가 매번 다른 자리에서 실패하던
      단일 원인이 이것이다.

      실측 비교(같은 기계, 같은 스위트):
        dev 서버      3m00s / 2m41s  · 각 1건 실패 · 최장 시험 15.6s
        빌드(콜드)    48s + 32s = 81s · 96/96 · 최장 시험 2.3s
        빌드(웜)      28s + 20s = 48s · 96/96 (3회 연속 초록)
      매번 새로 빌드해도 dev 보다 2.2배 빠르고 무작위 실패가 없다.

      고치고 바로 돌려보는 루프가 필요하면 E2E_DEV_SERVER=1 로 명시적으로 켠다.
      단 그때의 실패는 신뢰하지 않는다 — 위 이유로 제품과 무관하게 깨질 수 있다.
    */
    command: USE_DEV_SERVER
      ? `pnpm dev --webpack --hostname localhost --port ${port}`
      : `pnpm build && pnpm start --hostname localhost --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: USE_DEV_SERVER ? 120_000 : 300_000,
    env: {
      // 개발 서버(.next)와 산출물을 나눠 두 인스턴스가 공존하게 한다.
      //
      // 곁들여 tsconfig.json 의 exclude 에 `.next/dev/types` 와 `.next-e2e/dev/types` 가
      // 들어 있다. dev 서버가 그 안의 validator.ts 를 계속 다시 쓰는데, tsconfig 는 두
      // 디렉터리의 생성 타입을 모두 include 해서 e2e 빌드의 타입 검사가 **다른 서버가
      // 쓰는 중인 파일**을 읽었다. 실제로 반쯤 쓰인 파일을 읽고
      // `Cannot find name 'onse'`(Promise<Response | void> 가 잘린 것)로 빌드가 죽었다.
      // 라우트 타입은 `.next/types`·`.next-e2e/types` 가 그대로 담당한다.
      NEXT_DIST_DIR: ".next-e2e",
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
