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
