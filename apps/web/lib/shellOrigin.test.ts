/**
 * 앱 셸이 "이 주소를 앱 안에서 열어도 되나"를 판정하는 규칙.
 *
 * 틀리면 조용히 위험하다 — WebView 안에서 열린 문서는 무엇이든
 * `window.ReactNativeWebView.postMessage` 로 네이티브 브리지(사진 저장·알림 권한·공유)를
 * 부를 수 있다. 그래서 "통과시키면 안 되는 것"을 중심으로 적는다.
 */
import { canonicalOAuthCallbackUrl, resolveShellOrigin, isOAuthFlowUrl, isSameOrigin, originOf } from "@harucut/shared";

const WEB = "https://www.harucut.com";
const API = "https://api.harucut.com";

describe("릴리스 주소와 운영 소셜 콜백", () => {
  it.each(["http://localhost:3000", "https://preview.example", "https://www.harucut.com", undefined])("릴리스는 설정 %s에 관계없이 공식 웹을 연다", (value) => {
    expect(resolveShellOrigin(value, WEB, false)).toBe(WEB);
  });
  it("개발 모드에서만 로컬 원점을 쓴다", () => {
    expect(resolveShellOrigin("http://localhost:3000/", WEB, true)).toBe("http://localhost:3000");
  });
  it.each(["javascript:alert(1)", "https://name:secret@www.harucut.com", "http://localhost:3000/shoot", "not a url"])("잘못된 개발 설정 %s는 버린다", (value) => {
    expect(resolveShellOrigin(value, WEB, true)).toBe(WEB);
  });
  it("apex 콜백의 성공·실패 쿼리를 같은 WebView의 www로 옮긴다", () => {
    expect(canonicalOAuthCallbackUrl("https://harucut.com/oauth2/callback?error=access_denied", WEB)).toBe(`${WEB}/oauth2/callback?error=access_denied`);
    expect(isSameOrigin("https://harucut.com/oauth2/callback", WEB)).toBe(false);
  });
  it.each(["https://harucut.com/home", "https://harucut.com/oauth2/callback/evil", "https://harucut.com.evil.example/oauth2/callback", "https://harucut.com:8443/oauth2/callback", "http://harucut.com/oauth2/callback", "https://name:secret@harucut.com/oauth2/callback"])("콜백 예외를 %s로 넓히지 않는다", (url) => {
    expect(canonicalOAuthCallbackUrl(url, WEB)).toBeNull();
  });
});

describe("originOf", () => {
  it("경로·쿼리를 떼고 오리진만 남긴다", () => {
    expect(originOf("https://www.harucut.com/home?a=1#x")).toBe(WEB);
  });

  it("오리진이 없는 스킴과 못 읽는 주소는 null", () => {
    // URL.origin 은 이런 스킴에서 문자열 "null" 을 준다 — 값으로서의 null 로 바꿔야
    // 서로 다른 두 주소가 "null" === "null" 로 같다고 판정되지 않는다.
    expect(originOf("mailto:a@b.com")).toBeNull();
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });

  it("오리진 없는 주소끼리 같다고 하지 않는다", () => {
    expect(isSameOrigin("mailto:a@b.com", "mailto:c@d.com")).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("같은 오리진이면 경로가 달라도 통과", () => {
    expect(isSameOrigin("https://www.harucut.com/shoot/result", WEB)).toBe(true);
  });

  /*
    핵심 회귀. 예전에는 `url.startsWith(WEB_ORIGIN)` 이었다 — 도메인 뒤에 무엇이든 붙일 수
    있어서 남의 서버가 우리 앱 안에서 열렸다.
  */
  it("우리 도메인으로 시작하기만 하는 남의 주소를 막는다", () => {
    expect(isSameOrigin("https://www.harucut.com.evil.example/", WEB)).toBe(false);
    expect(isSameOrigin("https://www.harucut.com.evil.example/x", WEB)).toBe(false);
  });

  it("하위 도메인·다른 스킴·다른 포트를 막는다", () => {
    expect(isSameOrigin("https://evil.www.harucut.com/", WEB)).toBe(false);
    expect(isSameOrigin("http://www.harucut.com/", WEB)).toBe(false);
    expect(isSameOrigin("https://www.harucut.com:8443/", WEB)).toBe(false);
  });

  it("사용자 정보를 앞에 붙여 속이는 주소를 막는다", () => {
    expect(isSameOrigin("https://www.harucut.com@evil.example/", WEB)).toBe(false);
  });
});

describe("isOAuthFlowUrl", () => {
  it("백엔드 인가 경로는 통과", () => {
    expect(isOAuthFlowUrl(`${API}/oauth2/authorization/google`, API)).toBe(true);
    expect(isOAuthFlowUrl(`${API}/oauth2/authorization/kakao`, API)).toBe(true);
  });

  /*
    회귀. 시작만 열어 두면 제공자 인증을 마치고 돌아오는 콜백이 밖으로 밀려나고,
    세션 쿠키가 외부 브라우저에 저장돼 앱은 계속 로그아웃 상태로 남는다.
    경로는 백엔드 설정에서 확인했다(redirect-uri: "{baseUrl}/login/oauth2/code/{provider}").
  */
  it("백엔드 콜백 경로도 통과 — 안 그러면 로그인이 끝나지 않는다", () => {
    expect(isOAuthFlowUrl(`${API}/login/oauth2/code/google`, API)).toBe(true);
    expect(isOAuthFlowUrl(`${API}/login/oauth2/code/kakao?code=x&state=y`, API)).toBe(true);
    expect(isOAuthFlowUrl(`${API}/login/oauth2/code/naver`, API)).toBe(true);
  });

  it("백엔드 오리진이어도 OAuth 와 무관한 경로는 막는다", () => {
    expect(isOAuthFlowUrl(`${API}/api/auth/user/info`, API)).toBe(false);
    expect(isOAuthFlowUrl(`${API}/`, API)).toBe(false);
  });

  it("제공자 도메인은 하위 도메인까지 통과", () => {
    expect(isOAuthFlowUrl("https://accounts.google.com/o/oauth2/v2/auth", API)).toBe(true);
    expect(isOAuthFlowUrl("https://kauth.kakao.com/oauth/authorize", API)).toBe(true);
    expect(isOAuthFlowUrl("https://nid.naver.com/oauth2.0/authorize", API)).toBe(true);
  });

  /*
    핵심 회귀. 예전에는 URL 전체에서 /(kakao|naver|google)/i 를 찾았다 —
    쿼리스트링에 단어만 넣으면 아무 서버나 앱 안에서 열렸다.
  */
  it("주소 어딘가에 제공자 이름만 들어간 남의 주소를 막는다", () => {
    expect(isOAuthFlowUrl("https://evil.example/?q=google", API)).toBe(false);
    expect(isOAuthFlowUrl("https://evil.example/kakao/login", API)).toBe(false);
    expect(isOAuthFlowUrl("https://google.com.evil.example/", API)).toBe(false);
  });

  it("인가 경로여도 남의 오리진이면 막는다", () => {
    expect(isOAuthFlowUrl("https://evil.example/oauth2/authorization/google", API)).toBe(false);
  });

  it("http 는 막는다 — 로그인 흐름은 전부 https 다", () => {
    expect(isOAuthFlowUrl("http://accounts.google.com/o/oauth2/v2/auth", API)).toBe(false);
  });

  it("파싱할 수 없는 주소는 막는다", () => {
    expect(isOAuthFlowUrl("javascript:alert(1)", API)).toBe(false);
    expect(isOAuthFlowUrl("not a url", API)).toBe(false);
  });
});
