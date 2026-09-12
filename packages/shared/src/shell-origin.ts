/**
 * 앱 셸(WebView)이 "이 주소를 앱 안에서 열어도 되나"를 판정하는 규칙.
 *
 * 앱 코드가 아니라 여기 두는 이유는 **테스트 때문**이다. 모바일 워크스페이스에는 테스트
 * 러너가 없고, 이 판정은 틀리면 조용히 위험해진다 — WebView 안에서 열린 문서는 무엇이든
 * `window.ReactNativeWebView.postMessage` 로 네이티브 브리지(사진 저장·알림 권한·공유)를
 * 부를 수 있다. 그래서 규칙만 떼어 웹 쪽 jest 로 지킨다.
 *
 * 설정값(우리 웹 오리진·백엔드 오리진)을 읽는 일은 앱에 남는다
 * (`apps/mobile/constants/shell.ts`).
 */

/**
 * URL 의 origin. 쓸 수 없는 주소면 null.
 *
 * `mailto:`·`javascript:` 처럼 오리진이 없는 스킴에서 `URL.origin` 은 **문자열 "null"** 을
 * 돌려준다. 그대로 두면 서로 다른 두 주소가 `"null" === "null"` 로 같다고 판정된다.
 * 값으로서의 null 로 바꿔 그 비교가 성립하지 않게 한다.
 */
export function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

/**
 * 두 주소가 같은 오리진인가.
 *
 * **접두사 비교를 쓰지 않는다.** `startsWith('https://www.harucut.com')` 는
 * `https://www.harucut.com.evil.example/` 를 통과시킨다 — 도메인 끝에 뭐든 붙일 수 있다.
 */
export function isSameOrigin(url: string, origin: string): boolean {
  const parsed = originOf(url);
  return parsed !== null && parsed === originOf(origin);
}

/**
 * 백엔드에서 소셜 로그인이 지나가는 경로. **둘 다 필요하다.**
 *
 * 시작만 열어 두면 제공자 인증을 마치고 돌아오는 **콜백이 밖으로 밀려난다.** 그러면 세션
 * 쿠키가 외부 브라우저에 저장돼 WebView 는 계속 로그아웃 상태다 — 로그인이 끝나지 않는다.
 *
 * 경로는 Spring Security 기본값이고 백엔드 설정에서 확인했다
 * (`application.yaml` 의 `redirect-uri: "{baseUrl}/login/oauth2/code/{provider}"`).
 */
const API_OAUTH_PATH_PREFIXES = [
  '/oauth2/authorization/',
  '/login/oauth2/code/',
] as const;

/** 소셜 로그인이 거쳐 가는 제공자 도메인. 하위 도메인까지 허용한다. */
export const OAUTH_PROVIDER_DOMAINS = [
  'google.com',
  'kakao.com',
  'naver.com',
] as const;

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * 앱 안에서 이어가야 하는 소셜 로그인 흐름인가.
 *
 * 밖으로 내보내면 돌아온 쿠키가 WebView 저장소에 남지 않아 로그인이 끊긴다. 그래서 통과는
 * 시키되 **호스트로만** 판단한다. 예전에는 URL 전체에서 `google|kakao|naver` 를 찾았는데,
 * 그러면 `https://evil.example/?q=google` 같은 주소가 그대로 앱 안에서 열렸다.
 *
 * 시작 지점(백엔드 인가 경로)은 오리진과 경로를 함께 본다.
 */
export function isOAuthFlowUrl(url: string, apiOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // 로그인 흐름은 전부 https 다. http 를 허용하면 중간에서 갈아치울 수 있다.
  if (parsed.protocol !== 'https:') return false;

  if (parsed.origin === originOf(apiOrigin)) {
    return API_OAUTH_PATH_PREFIXES.some((prefix) =>
      parsed.pathname.startsWith(prefix),
    );
  }

  return OAUTH_PROVIDER_DOMAINS.some((domain) =>
    hostMatches(parsed.hostname, domain),
  );
}
