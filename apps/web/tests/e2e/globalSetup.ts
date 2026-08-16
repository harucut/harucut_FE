import type { FullConfig } from "@playwright/test";

/**
 * e2e 가 붙은 서버에 로그인 우회가 켜져 있지 않은지 먼저 확인한다.
 *
 * playwright.config.ts 의 `webServer.env` 는 `NEXT_PUBLIC_DEV_AUTH_BYPASS=0` 을 준다.
 * 그런데 `reuseExistingServer` 때문에, 개발자가 손으로 띄워 둔 3000번 서버가 있으면
 * 그쪽을 그대로 집어 쓴다. 그 서버는 `.env.local` 을 읽으므로 바이패스가 켜져 있을 수 있고,
 * 그러면 인증 가드가 통째로 꺼진 화면을 검사하게 된다.
 *
 * 그 상태로 돌리면 가드 스펙 열두 개가 한꺼번에 빨갛게 뜬다. 원인이 환경인데 제품이
 * 깨진 것처럼 보여서, 실제로 한 번 헛짚었다. 열두 개의 모호한 실패 대신 한 줄로 말한다.
 */
async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ??
    config.projects[0]?.use?.baseURL ??
    `http://localhost:${Number(process.env.PORT ?? 3000)}`;

  const response = await fetch(`${baseURL}/mypage`, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const redirectsToLogin =
    (response.status === 307 || response.status === 308 || response.status === 302) &&
    location.includes("/login");

  if (redirectsToLogin) return;

  throw new Error(
    [
      `e2e 가 붙은 서버(${baseURL})가 보호 경로 /mypage 를 로그인으로 보내지 않습니다.`,
      `받은 응답: ${response.status} ${location || "(리다이렉트 없음)"}`,
      "",
      "십중팔구 그 서버에 NEXT_PUBLIC_DEV_AUTH_BYPASS=1 이 켜져 있습니다",
      "(apps/web/.env.local). 손으로 띄운 개발 서버를 재사용하면 그렇게 됩니다.",
      "3000번 개발 서버를 끄고 다시 돌리면 Playwright 가 바이패스를 끈 서버를 직접 띄웁니다.",
    ].join("\n"),
  );
}

export default globalSetup;
