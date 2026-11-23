/**
 * 인앱 브라우저(카카오톡·인스타그램 등) 판별과 외부 브라우저로 나가기.
 *
 * 인앱 브라우저는 카메라를 막거나 내려받기를 삼키는 일이 많다. 참가 화면은 들어올 때 자동으로 내보내고
 * (useExternalBrowserRedirect), 그래도 카메라가 안 되면 버튼으로 다시 시도하게 한다.
 * 결과 화면(/r)은 내보내지 않는다 — 토큰이 든 주소를 중계 주소에 옮기면 안 된다(기획 R5 16절).
 */
export type InAppKind = "kakao" | "line" | "other" | null;

export function detectInAppBrowser(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): InAppKind {
  const ua = userAgent.toLowerCase();
  if (ua.includes("harucutapp")) return null;
  if (ua.includes("kakaotalk")) return "kakao";
  if (ua.includes("line/") || ua.includes(" line ")) return "line";
  if (/instagram|fb_iab|fban|fbios|fbss|fb4a|twitter|naver|kakaostory|band\/|everytimeapp|snapchat/.test(ua)) return "other";
  return null;
}

/** 이 주소를 기기 기본 브라우저로 연다. 열 방법을 모르면 false — 호출부가 링크 복사를 안내한다. */
export function openInExternalBrowser(href: string, userAgent = navigator.userAgent): boolean {
  const ua = userAgent.toLowerCase();
  const kind = detectInAppBrowser(ua);
  if (kind === "kakao") {
    window.location.replace(`kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`);
    return true;
  }
  if (kind === "line") {
    const url = new URL(href);
    url.searchParams.set("openExternalBrowser", "1");
    window.location.replace(url.toString());
    return true;
  }
  if (kind === "other" && /android/.test(ua)) {
    const hostAndPath = href.replace(/^https?:\/\//i, "");
    window.location.replace(
      `intent://${hostAndPath}#Intent;scheme=${href.startsWith("https") ? "https" : "http"};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`,
    );
    return true;
  }
  return false;
}
