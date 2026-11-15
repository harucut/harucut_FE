import fs from "node:fs";
import path from "node:path";
import {
  PROTECTED_PATHS,
  isGuestAllowedPath,
  isBlockedAccountPath,
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
      "/studio",
      "/admin",
    ]);
  });

  test("keeps the proxy matcher list aligned with protected routes", () => {
    for (const matcher of [
      '"/home/:path*"',
      '"/shoot/:path*"',
      '"/history/:path*"',
      '"/theme/:path*"',
      '"/mypage"',
      '"/studio/:path*"',
      '"/admin/:path*"',
    ]) {
      expect(proxySource).toContain(matcher);
    }
  });

  test("정지 계정은 마이페이지 말고는 보호 경로에 들어가지 못한다", () => {
    expect(isBlockedAccountPath("/mypage")).toBe(true);
    expect(isBlockedAccountPath("/mypage.segments/_tree.segment")).toBe(true);
    expect(isBlockedAccountPath("/mypages")).toBe(false);
    expect(isBlockedAccountPath("/home")).toBe(false);
    expect(isBlockedAccountPath("/studio/events/Ev1")).toBe(false);
    expect(isBlockedAccountPath("/admin")).toBe(false);
    expect(proxySource).toContain("isBlockedAccountPath(pathname)");
  });

  test("recognizes protected routes and subroutes", () => {
    expect(isProtectedPath("/home")).toBe(true);
    expect(isProtectedPath("/shoot/capture")).toBe(true);
    expect(isProtectedPath("/theme/sticker")).toBe(true);
    expect(isProtectedPath("/history")).toBe(true);
    expect(isProtectedPath("/mypage")).toBe(true);
    expect(isProtectedPath("/studio/events/Ev1")).toBe(true);
    expect(isProtectedPath("/admin")).toBe(true);
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
    갤러리에서 불러오기는 따로 경로가 없다 — 사진 고르기 화면 안의 칸이고, 회원에게만 보인다(2026-11-15). 예전
    `/shoot/upload` 는 회원 전용 예외였다. 경계는 세그먼트로 본다 — 이름이 비슷한 다른 경로를 촬영으로 읽지 않는다.
  */
  test("경계는 세그먼트로 본다", () => {
    expect(isGuestAllowedPath("/shootings")).toBe(false);
  });

  test("보호 경로 중 촬영 밖은 비회원에게 열지 않는다", () => {
    for (const path of ["/home", "/history", "/theme", "/mypage"]) {
      expect(isGuestAllowedPath(path)).toBe(false);
    }
  });
});
