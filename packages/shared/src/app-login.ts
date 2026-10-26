/**
 * 앱 로그인(P4, R5 16절) — 시스템 브라우저 OAuth·PKCE·딥링크 수신.
 *
 * 구글은 임베디드 WebView 의 OAuth 를 막는다(`disallowed_useragent`). 그래서 셸은 구글 로그인 시작을
 * 가로채 시스템 브라우저(ASWebAuthenticationSession·Custom Tabs)로 열고, 백엔드는 쿠키 대신 일회용 코드를
 * `harucut://oauth2/callback?code=…` 로 돌려준다. 시스템 브라우저의 쿠키는 WebView 로 넘어오지 않으므로
 * 그 코드를 **WebView 안의 웹**이 교환해야 세션 쿠키가 WebView 저장소에 남는다.
 *
 * PKCE: 셸이 verifier 를 만들고 challenge(S256)만 시작 주소에 싣는다. 다른 앱이 `harucut://` 를 가로채
 * 코드를 훔쳐도 verifier 없이는 교환하지 못한다.
 *
 * 판정 규칙은 여기 둔다 — 모바일에는 테스트 러너가 없어 웹 jest(apps/web/lib/appLogin.test.ts)로 지킨다.
 */

/** 백엔드가 돌려보내는 앱 콜백. 고정 스킴 하나뿐이다(열린 redirect 없음). */
export const APP_LOGIN_CALLBACK = 'harucut://oauth2/callback';

/** 코드를 받아 교환하는 웹 경로. 코드·verifier 는 fragment 로 실어 서버 로그·Referer 에 남지 않게 한다. */
export const APP_LOGIN_EXCHANGE_PATH = '/oauth2/app-callback';

/**
 * 시스템 브라우저로 보낼 제공자. 카카오·네이버는 WebView 안에서 그대로 되므로(지금도 동작) 바꾸지 않는다.
 */
export const APP_LOGIN_PROVIDERS = ['google'] as const;

/**
 * 셸이 가로챌 소셜 로그인 시작인가. 백엔드 오리진의 `/oauth2/authorization/{google}` 이고 아직 앱 표시가
 * 없을 때만 — 이미 `client=app` 이 붙었으면(시스템 브라우저 안의 이동) 다시 가로채지 않는다.
 */
export function appLoginProviderOf(url: string, apiOrigin: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(apiOrigin).origin || parsed.username || parsed.password) return null;
    const match = /^\/oauth2\/authorization\/([a-z]+)$/.exec(parsed.pathname);
    if (!match || !(APP_LOGIN_PROVIDERS as readonly string[]).includes(match[1])) return null;
    if (parsed.searchParams.has('client')) return null;
    return match[1];
  } catch {
    return null;
  }
}

/** 시스템 브라우저로 열 시작 주소. 원래 쿼리는 두고 앱 표시와 challenge 만 더한다. */
export function appLoginStartUrl(url: string, codeChallenge: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('client', 'app');
  parsed.searchParams.set('code_challenge', codeChallenge);
  parsed.searchParams.set('code_challenge_method', 'S256');
  return parsed.toString();
}

export type AppLoginCallback = { kind: 'code'; code: string } | { kind: 'error'; error: string };

/** 시스템 브라우저가 돌려준 주소를 읽는다. 앱 콜백이 아니면 null. */
export function parseAppLoginCallback(url: string): AppLoginCallback | null {
  if (!url.startsWith(`${APP_LOGIN_CALLBACK}?`) && url !== APP_LOGIN_CALLBACK) return null;
  const params = new URLSearchParams(url.slice(APP_LOGIN_CALLBACK.length + 1));
  const code = params.get('code')?.trim();
  if (code) return { kind: 'code', code };
  return { kind: 'error', error: params.get('error')?.trim() || 'unknown' };
}

/**
 * 콜백 결과로 WebView 가 열 웹 주소.
 * - 코드: 교환 화면에 fragment 로 코드와 verifier 를 넘긴다.
 * - 실패: 기존 소셜 로그인 콜백(`/oauth2/callback?error=`)이 실패 안내를 맡는다.
 */
export function appLoginWebUrl(webOrigin: string, result: AppLoginCallback, codeVerifier: string): string {
  if (result.kind === 'error') {
    return `${webOrigin}/oauth2/callback?error=${encodeURIComponent(result.error)}`;
  }
  const fragment = new URLSearchParams({ code: result.code, verifier: codeVerifier });
  return `${webOrigin}${APP_LOGIN_EXCHANGE_PATH}#${fragment.toString()}`;
}

/** base64 → base64url(패딩 없음). PKCE challenge·verifier 모양(RFC 7636). */
export function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
