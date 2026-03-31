import fs from "node:fs";
import path from "node:path";
import { PROTECTED_PATHS, isProtectedPath } from "@/lib/protectedPaths";

const proxySource = fs.readFileSync(
  path.join(process.cwd(), "proxy.ts"),
  "utf8",
);

describe("route protection contract", () => {
  test("keeps the protected route list stable", () => {
    expect(PROTECTED_PATHS).toEqual([
      "/home",
      "/shoot",
      "/upload",
      "/history",
      "/theme",
      "/mypage",
    ]);
  });

  test("keeps the proxy matcher list aligned with protected routes", () => {
    for (const matcher of [
      '"/home/:path*"',
      '"/shoot/:path*"',
      '"/upload/:path*"',
      '"/history/:path*"',
      '"/theme/:path*"',
      '"/mypage"',
    ]) {
      expect(proxySource).toContain(matcher);
    }
  });

  test("recognizes protected routes and subroutes", () => {
    expect(isProtectedPath("/home")).toBe(true);
    expect(isProtectedPath("/shoot/capture")).toBe(true);
    expect(isProtectedPath("/upload/result")).toBe(true);
    expect(isProtectedPath("/theme/sticker")).toBe(true);
    expect(isProtectedPath("/history")).toBe(true);
    expect(isProtectedPath("/mypage")).toBe(true);
  });

  test("does not treat public auth routes as protected", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/signup")).toBe(false);
    expect(isProtectedPath("/forgot-password")).toBe(false);
  });
});
