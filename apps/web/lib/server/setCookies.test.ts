/** @jest-environment node */

import { adaptSetCookieForRequest } from "@/lib/server/setCookies";

function reqAt(url: string) {
  return new Request(url);
}

describe("adaptSetCookieForRequest", () => {
  // 백엔드(api.harucut.com)가 내려주는 실제 인증 쿠키 형태.
  const backendAuthCookie =
    "accessToken=t; Path=/; Domain=harucut.com; Max-Age=3600; Secure; HttpOnly; SameSite=None";

  it("downgrades SameSite=None to Lax and strips Secure/Domain on http localhost", () => {
    // SameSite=None은 Secure 없이는 브라우저가 거부 → localhost(http)에서 인증 쿠키가
    // 저장되지 않아 로그인이 풀리던 버그를 막는다.
    const result = adaptSetCookieForRequest(
      backendAuthCookie,
      reqAt("http://localhost:3000/api/auth/session"),
    );

    expect(result).toBe("accessToken=t; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax");
    expect(result).not.toMatch(/Secure/i);
    expect(result).not.toMatch(/Domain=/i);
    expect(result).not.toMatch(/SameSite=None/i);
  });

  it("keeps Secure/Domain/SameSite=None untouched on https same-site (prod)", () => {
    const result = adaptSetCookieForRequest(
      backendAuthCookie,
      reqAt("https://harucut.com/api/auth/session"),
    );

    expect(result).toBe(backendAuthCookie);
  });

  it("keeps the cookie for a https subdomain frontend (www.harucut.com)", () => {
    const result = adaptSetCookieForRequest(
      backendAuthCookie,
      reqAt("https://www.harucut.com/api/auth/session"),
    );

    // 같은 등록 도메인이라 Domain 유지, https라 Secure·SameSite=None 유지.
    expect(result).toContain("Domain=harucut.com");
    expect(result).toContain("Secure");
    expect(result).toContain("SameSite=None");
  });
});
