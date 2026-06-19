import {
  buildPathWithRedirect,
  getSafeRedirectPath,
  resolveRedirectTarget,
} from "@/lib/redirect";

describe("redirect helpers", () => {
  test("accepts internal product routes", () => {
    expect(getSafeRedirectPath("/mypage")).toBe("/mypage");
    expect(getSafeRedirectPath("/shoot/capture?step=2")).toBe(
      "/shoot/capture?step=2",
    );
  });

  test("rejects external or auth-only redirect targets", () => {
    expect(getSafeRedirectPath("https://example.com")).toBeNull();
    expect(getSafeRedirectPath("//example.com")).toBeNull();
    expect(getSafeRedirectPath("/login")).toBeNull();
    expect(getSafeRedirectPath("/signup?redirectTo=/mypage")).toBeNull();
  });

  test("rejects protocol-relative bypasses using backslashes or control chars", () => {
    // 브라우저가 역슬래시를 슬래시로 정규화하면 "//evil.com"이 되어 외부로 나간다.
    expect(getSafeRedirectPath("/\\evil.com")).toBeNull();
    expect(getSafeRedirectPath("/\\/evil.com")).toBeNull();
    expect(getSafeRedirectPath("\\\\evil.com")).toBeNull();
    expect(getSafeRedirectPath("\\/evil.com")).toBeNull();
    // 선행 탭/개행을 제거하면 "//evil.com"이 드러나는 우회.
    expect(getSafeRedirectPath("/\t/evil.com")).toBeNull();
    expect(getSafeRedirectPath("\n//evil.com")).toBeNull();
  });

  test("falls back to home when redirect target is missing", () => {
    expect(resolveRedirectTarget(null)).toBe("/home");
    expect(resolveRedirectTarget("/login")).toBe("/home");
  });

  test("preserves valid redirect targets across auth pages", () => {
    expect(buildPathWithRedirect("/login", "/mypage")).toBe(
      "/login?redirectTo=%2Fmypage",
    );
    expect(buildPathWithRedirect("/signup", "/shoot/capture?mode=retry")).toBe(
      "/signup?redirectTo=%2Fshoot%2Fcapture%3Fmode%3Dretry",
    );
    expect(buildPathWithRedirect("/login", "https://example.com")).toBe(
      "/login",
    );
  });
});
