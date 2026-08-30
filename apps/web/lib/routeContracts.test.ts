import fs from "node:fs";
import path from "node:path";
import {
  PROTECTED_PATHS,
  isGuestAllowedPath,
  isProtectedPath,
} from "@/lib/protectedPaths";

const proxySource = fs.readFileSync(
  path.join(process.cwd(), "proxy.ts"),
  "utf8",
);

describe("route protection contract", () => {
  test("keeps the protected route list stable", () => {
    expect(PROTECTED_PATHS).toEqual([
      "/home",
      "/shoot",
      "/history",
      "/theme",
      "/mypage",
    ]);
  });

  test("keeps the proxy matcher list aligned with protected routes", () => {
    for (const matcher of [
      '"/home/:path*"',
      '"/shoot/:path*"',
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

/*
  비회원 체험 범위는 약관 제8조와 `GUEST_ALLOWED_ITEMS`("사진 촬영과 이미지 저장")가 정한다.
  코드가 그보다 넓으면 화면이 거짓말을 한다.
*/
describe("guest trial contract", () => {
  test("촬영 흐름은 열어 준다", () => {
    expect(isGuestAllowedPath("/shoot")).toBe(true);
    expect(isGuestAllowedPath("/shoot/capture")).toBe(true);
    expect(isGuestAllowedPath("/shoot/select")).toBe(true);
    expect(isGuestAllowedPath("/shoot/result")).toBe(true);
  });

  /*
    회귀. 갤러리 불러오기는 원래 `/upload` 였고 회원 전용이었다. 촬영 흐름으로 합치면서
    `/shoot/upload` 로 옮겨 왔는데, `/shoot` 접두사 허용에 딸려 비회원에게도 열렸다.
  */
  test("갤러리 불러오기는 회원만", () => {
    expect(isGuestAllowedPath("/shoot/upload")).toBe(false);
  });

  test("이름이 비슷한 다른 경로까지 막지는 않는다", () => {
    expect(isGuestAllowedPath("/shoot/uploads")).toBe(true);
  });

  test("보호 경로 중 촬영 밖은 비회원에게 열지 않는다", () => {
    for (const path of ["/home", "/history", "/theme", "/mypage"]) {
      expect(isGuestAllowedPath(path)).toBe(false);
    }
  });
});
