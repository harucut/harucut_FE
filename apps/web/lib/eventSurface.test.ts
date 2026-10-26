import { EVENT_SURFACE_PREFIXES, isEventSurfacePath } from "@/lib/eventSurface";
import { COLOR_THEME_BOOTSTRAP_SCRIPT, EVENT_SURFACE_PATH_PATTERN } from "@/lib/colorTheme";

describe("isEventSurfacePath", () => {
  it.each(["/e", "/e/wedding-0101", "/r", "/booth", "/booth/pair"])("%s 는 행사 화면이다", (path) => {
    expect(isEventSurfacePath(path)).toBe(true);
  });

  // 접두사만 보면 개인 서비스의 다른 경로까지 걸린다.
  it.each(["/", "/enterprise", "/events", "/reactivate", "/home", "/shoot", "/boothx", null, undefined])(
    "%s 는 행사 화면이 아니다",
    (path) => {
      expect(isEventSurfacePath(path)).toBe(false);
    },
  );

  // 부트스트랩 스크립트는 번들 밖의 인라인 문자열이라 같은 규칙을 정규식으로 따로 든다.
  it("테마 부트스트랩의 정규식이 같은 경로를 고른다", () => {
    const pattern = new RegExp(EVENT_SURFACE_PATH_PATTERN);
    for (const path of ["/e", "/e/x", "/r", "/booth", "/booth/pair", "/events", "/reactivate", "/home"]) {
      expect(pattern.test(path)).toBe(isEventSurfacePath(path));
    }
    for (const prefix of EVENT_SURFACE_PREFIXES) {
      expect(pattern.test(prefix)).toBe(true);
    }
  });
});

describe("COLOR_THEME_BOOTSTRAP_SCRIPT 와 행사 화면", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  function runBootstrap() {
    // 레이아웃이 <script> 로 인라인 실행하는 것과 같은 문자열을 그대로 돌린다.
    new Function(COLOR_THEME_BOOTSTRAP_SCRIPT)();
  }

  it("행사 화면에서는 저장된 개인 선호를 심지 않는다", () => {
    window.localStorage.setItem("harucut-web-color-theme", "dark");
    window.history.pushState({}, "", "/e/wedding-0101");

    runBootstrap();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    // 행사에 들어왔다고 개인의 선호를 지우지도 않는다.
    expect(window.localStorage.getItem("harucut-web-color-theme")).toBe("dark");
  });

  it("개인 서비스 화면에서는 저장된 선호를 그대로 심는다", () => {
    window.localStorage.setItem("harucut-web-color-theme", "dark");
    window.history.pushState({}, "", "/home");

    runBootstrap();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
