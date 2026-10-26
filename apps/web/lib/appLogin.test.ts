import {
  APP_LOGIN_CALLBACK,
  appLoginIntentPath,
  appLoginProviderOf,
  appLoginStartUrl,
  appLoginWebUrl,
  parseAppLoginCallback,
  toBase64Url,
} from "@harucut/shared";

const API = "https://api.harucut.com";
const WEB = "https://www.harucut.com";

/*
  앱 로그인(P4) 판정. 모바일에는 테스트 러너가 없어 여기서 지킨다(packages/shared/src/app-login.ts).
  틀리면 조용히 위험하다 — 남의 주소를 시스템 브라우저로 열거나, 남의 스킴을 우리 콜백으로 읽는다.
*/
describe("앱 로그인 판정", () => {
  it("백엔드 오리진의 구글 로그인 시작만 가로챈다", () => {
    expect(appLoginProviderOf(`${API}/oauth2/authorization/google`, API)).toBe("google");
    // 카카오·네이버는 WebView 안에서 그대로 된다.
    expect(appLoginProviderOf(`${API}/oauth2/authorization/kakao`, API)).toBeNull();
    // 오리진이 다르면(접두사 속임 포함) 아니다.
    expect(appLoginProviderOf("https://api.harucut.com.evil.example/oauth2/authorization/google", API)).toBeNull();
    expect(appLoginProviderOf(`${WEB}/oauth2/authorization/google`, API)).toBeNull();
    // 이미 앱 표시가 붙은 이동은 다시 가로채지 않는다.
    expect(appLoginProviderOf(`${API}/oauth2/authorization/google?client=app`, API)).toBeNull();
    expect(appLoginProviderOf("not a url", API)).toBeNull();
  });

  it("시작 주소에 앱 표시와 S256 challenge 를 붙인다", () => {
    const url = new URL(appLoginStartUrl(`${API}/oauth2/authorization/google?prompt=select_account`, "abc_-1"));
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("client")).toBe("app");
    expect(url.searchParams.get("code_challenge")).toBe("abc_-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("우리 앱 콜백만 읽고, 코드가 없으면 실패로 본다", () => {
    expect(parseAppLoginCallback(`${APP_LOGIN_CALLBACK}?code=c1`)).toEqual({ kind: "code", code: "c1" });
    expect(parseAppLoginCallback(`${APP_LOGIN_CALLBACK}?error=access_denied`)).toEqual({ kind: "error", error: "access_denied" });
    expect(parseAppLoginCallback(APP_LOGIN_CALLBACK)).toEqual({ kind: "error", error: "unknown" });
    expect(parseAppLoginCallback("harucut://oauth2/callbackx?code=c1")).toBeNull();
    expect(parseAppLoginCallback("evil://oauth2/callback?code=c1")).toBeNull();
  });

  it("코드는 fragment 로 교환 화면에, 실패는 기존 콜백의 error 로 보낸다", () => {
    const url = new URL(appLoginWebUrl(WEB, { kind: "code", code: "c 1" }, "v1"));
    expect(url.pathname).toBe("/oauth2/app-callback");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("code")).toBe("c 1");
    expect(new URLSearchParams(url.hash.slice(1)).get("verifier")).toBe("v1");
    expect(appLoginWebUrl(WEB, { kind: "error", error: "a&b" }, "v1")).toBe(`${WEB}/oauth2/callback?error=a%26b`);
  });

  it("base64 를 패딩 없는 base64url 로 바꾼다", () => {
    expect(toBase64Url("ab+/cd==")).toBe("ab-_cd");
    expect(toBase64Url("====")).toBe("");
    expect(toBase64Url(`a${"=".repeat(50_000)}`)).toBe("a");
  });

  // 안드로이드는 앱 콜백을 일반 링크로도 보내 라우터가 「없는 화면」으로 이동했다(Codex #562).
  it("라우터는 앱 로그인 콜백으로 이동하지 않는다", () => {
    expect(appLoginIntentPath("harucut://oauth2/callback?code=c1", false)).toBeNull();
    expect(appLoginIntentPath("/oauth2/callback?code=c1", false)).toBeNull();
    expect(appLoginIntentPath("harucut://oauth2/callback?code=c1", true)).toBe("/");
    expect(appLoginIntentPath("/", false)).toBe("/");
  });
});
