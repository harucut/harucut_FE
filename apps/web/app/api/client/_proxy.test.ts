/** @jest-environment node */

import { forward } from "@/app/api/client/_proxy";

describe("client proxy forward", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns a JSON config error when the upstream URL is invalid", async () => {
    const req = new Request("http://localhost:3000/api/client/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    });

    const result = await forward(req, {
      method: "POST",
      url: "undefined/api/harucut/login",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      contentType: "application/json; charset=utf-8",
      setCookies: [],
    });
    expect(JSON.parse(result.body)).toEqual({
      code: "GEN-500",
      status: 500,
      message: "NEXT_PUBLIC_BASE_URL is not set or invalid.",
      data: null,
    });
  });

  it("strips accessToken/refreshToken cookies when stripAuthCookies is set", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock;

    const req = new Request("http://localhost:3000/api/client/auth/login", {
      method: "POST",
      headers: {
        cookie: "accessToken=stale; guestTrial=1; refreshToken=old",
      },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    await forward(req, {
      method: "POST",
      url: "https://api.harucut.com/api/harucut/login",
      stripAuthCookies: true,
    });

    const forwardedCookie = (fetchMock.mock.calls[0][1].headers as Record<string, string>)
      .cookie;
    // 인증 토큰만 제거되고 게스트 쿠키는 유지되어야 한다
    expect(forwardedCookie).toBe("guestTrial=1");
  });

  it("forwards all cookies when stripAuthCookies is not set", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock;

    const req = new Request("http://localhost:3000/api/client/user-info", {
      method: "GET",
      headers: { cookie: "accessToken=valid; refreshToken=ok" },
    });

    await forward(req, {
      method: "GET",
      url: "https://api.harucut.com/api/auth/user/info",
      forwardBody: false,
    });

    const forwardedCookie = (fetchMock.mock.calls[0][1].headers as Record<string, string>)
      .cookie;
    expect(forwardedCookie).toBe("accessToken=valid; refreshToken=ok");
  });

  it("returns a JSON upstream error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const req = new Request("http://localhost:3000/api/client/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com" }),
    });

    const result = await forward(req, {
      method: "POST",
      url: "https://api.harucut.com/api/harucut/login",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      contentType: "application/json; charset=utf-8",
      setCookies: [],
    });
    expect(JSON.parse(result.body)).toEqual({
      code: "GEN-502",
      status: 502,
      message: "Failed to reach backend server.",
      data: null,
    });
  });
});
