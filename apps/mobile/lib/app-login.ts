import {
  APP_LOGIN_CALLBACK,
  appLoginStartUrl,
  appLoginWebUrl,
  parseAppLoginCallback,
  toBase64Url,
} from '@harucut/shared';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

/**
 * 앱 로그인(P4, R5 16절). 구글은 WebView 안 OAuth 를 막으므로(`disallowed_useragent`) 시스템 브라우저로 연다.
 * 규칙(가로챌 주소·콜백 읽기·웹으로 넘길 주소)은 `@harucut/shared` 의 app-login 이 갖고, 여기서는 기기 기능만 붙인다.
 *
 * 1. PKCE verifier 를 만들고 challenge(S256)만 시작 주소에 싣는다.
 * 2. ASWebAuthenticationSession·Custom Tabs 로 연다 — `harucut://oauth2/callback` 으로 돌아오면 닫힌다.
 * 3. 받은 코드와 verifier 를 웹 교환 화면(fragment)으로 넘긴다. 교환은 WebView 안의 웹이 해야 쿠키가 남는다.
 *
 * 돌려주는 값은 WebView 가 열 웹 주소다. 사용자가 닫았으면 null — 지금 화면에 그대로 둔다.
 */
export async function startAppLogin(authorizationUrl: string, webOrigin: string): Promise<string | null> {
  const verifier = toBase64Url(btoa(String.fromCharCode(...Crypto.getRandomBytes(32))));
  const challenge = toBase64Url(
    await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
  );
  const result = await WebBrowser.openAuthSessionAsync(
    appLoginStartUrl(authorizationUrl, challenge),
    APP_LOGIN_CALLBACK,
  );
  if (result.type !== 'success') return null;
  const callback = parseAppLoginCallback(result.url);
  if (!callback) return null;
  return appLoginWebUrl(webOrigin, callback, verifier);
}
