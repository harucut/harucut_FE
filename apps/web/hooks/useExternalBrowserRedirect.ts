import { useEffect } from "react";

import "@/lib/nativeBridge";

/**
 * 인앱 브라우저(카카오/라인/인스타 등)에서 열렸을 때
 * 외부 브라우저로 유도하는 훅
 */
export function useExternalBrowserRedirect() {
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const href = window.location.href;
    const url = new URL(href);

    if (url.searchParams.get("openExternalBrowser") === "1") {
      return;
    }

    // 우리 앱 셸은 인앱 브라우저가 아니다. 이 검사가 없으면 앱이 켜지자마자 자기 화면을
    // 밖의 크롬으로 내보내고 빈 껍데기만 남는다. UA 토큰은 apps/mobile 셸이 붙인다.
    if (userAgent.includes("harucutapp") || window.__HARUCUT_NATIVE__) {
      return;
    }

    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);

    const isKakao = userAgent.includes("kakaotalk");
    const isLine = userAgent.includes("line");

    const isInstagram = userAgent.includes("instagram");
    const isFacebook =
      userAgent.includes("fb_iab") ||
      userAgent.includes("fban") ||
      userAgent.includes("fbios") ||
      userAgent.includes("fbss") ||
      userAgent.includes("fb4a");

    const isTwitter = userAgent.includes("twitter");
    const isNaverApp = userAgent.includes("naver");
    const isKakaoStory = userAgent.includes("kakaostory");
    const isBand = userAgent.includes("band");
    const isEverytime = userAgent.includes("everytimeapp");
    const isSnapchat = userAgent.includes("snapchat");

    // 일반 브라우저 UA 판별
    const isRegularBrowser =
      userAgent.includes("samsungbrowser") ||
      (userAgent.includes("wv") === false &&
        (userAgent.includes("chrome") ||
          userAgent.includes("firefox") ||
          userAgent.includes("fxios") ||
          userAgent.includes("safari") ||
          userAgent.includes("crios") ||
          userAgent.includes("edgios") ||
          userAgent.includes("edga") ||
          userAgent.includes("whale")));

    // 인앱 브라우저 판별
    const isGenericInApp =
      (isInstagram ||
        isFacebook ||
        isTwitter ||
        isKakaoStory ||
        isBand ||
        isEverytime ||
        isSnapchat ||
        isNaverApp) &&
      !isRegularBrowser;

    // 클립보드 복사 폴백 처리
    const copyToClipboard = async (text: string) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {}
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        return true;
      } catch {
        return false;
      }
    };

    // 플랫폼/앱별 외부 브라우저 열기 로직
    const redirect = async () => {
      if (isKakao) {
        const target =
          "kakaotalk://web/openExternal?url=" + encodeURIComponent(href);
        window.location.replace(target);
        return;
      }

      if (isLine) {
        const lineUrl = new URL(href);
        lineUrl.searchParams.set("openExternalBrowser", "1");
        window.location.replace(lineUrl.toString());
        return;
      }

      if (isGenericInApp) {
        if (isIOS) {
          await copyToClipboard(href);
          alert(
            'URL이 클립보드에 복사되었어요.\n\n아래에서 Safari가 열리면 주소창을 길게 눌러 "붙여넣기 및 이동"을 선택해 주세요.',
          );
          window.location.replace("x-web-search://?");
          return;
        } else if (isAndroid) {
          const hostAndPath = href.replace(/^https?:\/\//i, "");
          const fallback = encodeURIComponent(href);
          const intent =
            `intent://${hostAndPath}` +
            `#Intent;scheme=${href.startsWith("https") ? "https" : "http"}` +
            `;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
          window.location.replace(intent);
          return;
        }
      }
    };

    redirect();
  }, []);

  return null;
}
