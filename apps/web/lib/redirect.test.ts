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
