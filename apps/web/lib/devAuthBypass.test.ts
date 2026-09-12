// 로그인 우회 스위치가 프로덕션에서 절대 켜지지 않는지 확인한다.
// 모듈 최상단에서 한 번만 평가되므로 env를 바꾼 뒤 resetModules + 동적 import 로 다시 읽는다.

// process.env 의 NODE_ENV는 타입상 읽기 전용이라 테스트에서만 캐스팅해 쓴다.
const env = process.env as Record<string, string | undefined>;

async function loadDevAuthBypass() {
  jest.resetModules();
  const mod = await import("@/lib/devAuthBypass");
  return mod.DEV_AUTH_BYPASS;
}

describe("DEV_AUTH_BYPASS", () => {
  const originalNodeEnv = env.NODE_ENV;
  const originalFlag = env.NEXT_PUBLIC_DEV_AUTH_BYPASS;

  afterEach(() => {
    // process.env 에 undefined를 대입하면 문자열 "undefined"가 되므로 지워서 되돌린다.
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
    if (originalFlag === undefined) {
      delete env.NEXT_PUBLIC_DEV_AUTH_BYPASS;
    } else {
      env.NEXT_PUBLIC_DEV_AUTH_BYPASS = originalFlag;
    }
    jest.resetModules();
  });

  test("프로덕션에서는 플래그가 켜져 있어도 항상 꺼진다", async () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_DEV_AUTH_BYPASS = "1";

    await expect(loadDevAuthBypass()).resolves.toBe(false);
  });

  test('개발 환경에서 플래그가 정확히 "1"일 때만 켜진다', async () => {
    env.NODE_ENV = "development";
    env.NEXT_PUBLIC_DEV_AUTH_BYPASS = "1";

    await expect(loadDevAuthBypass()).resolves.toBe(true);
  });

  test("플래그가 없거나 다른 값이면 꺼진다", async () => {
    env.NODE_ENV = "development";

    delete env.NEXT_PUBLIC_DEV_AUTH_BYPASS;
    await expect(loadDevAuthBypass()).resolves.toBe(false);

    env.NEXT_PUBLIC_DEV_AUTH_BYPASS = "0";
    await expect(loadDevAuthBypass()).resolves.toBe(false);

    env.NEXT_PUBLIC_DEV_AUTH_BYPASS = "true";
    await expect(loadDevAuthBypass()).resolves.toBe(false);
  });
});
