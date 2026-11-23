import { renderHook } from "@testing-library/react";
import { useExternalBrowserRedirect } from "@/hooks/useExternalBrowserRedirect";

/**
 * jsdom 은 실제 이동을 하지 않고 「Not implemented: navigation」을 기록한다. 그 기록으로
 * 훅이 외부 브라우저 전환(location.replace)을 시도했는지 본다.
 */
function navigationAttempts(spy: jest.SpyInstance) {
  return spy.mock.calls.filter((call) => String(call[0]?.message ?? call[0]).includes("navigation")).length;
}

describe("useExternalBrowserRedirect", () => {
  const originalUA = navigator.userAgent;

  function setUserAgent(value: string) {
    Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
  }

  afterEach(() => {
    setUserAgent(originalUA);
    window.history.replaceState({}, "", "/");
    jest.restoreAllMocks();
  });

  it("카카오톡 인앱 브라우저에서는 외부 브라우저로 내보낸다", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    setUserAgent("Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.0");
    window.history.replaceState({}, "", "/e/wedding-1027");
    renderHook(() => useExternalBrowserRedirect());
    expect(navigationAttempts(errors)).toBeGreaterThan(0);
  });

  // 결과 토큰은 fragment 에 있다. intent:// 는 보존을 장담할 수 없고, 카카오 탈출은 링크 전체를
  // ?url= 에 싣는다(R5 16절). 결과 화면은 인앱 브라우저 안에서도 동작한다.
  it("결과 수령(/r)에서는 내보내지 않는다", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    setUserAgent("Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.0");
    window.history.replaceState({}, "", `/r#${"A".repeat(43)}`);
    renderHook(() => useExternalBrowserRedirect());
    expect(navigationAttempts(errors)).toBe(0);
  });
});
