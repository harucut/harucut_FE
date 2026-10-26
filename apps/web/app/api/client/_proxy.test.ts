/** @jest-environment node */

import { getApiErrorMessageByCode } from "@harucut/shared";

import {
  buildResponse,
  forward,
  proxyJson,
  validateEventSlug,
  validatePublicId,
  validateResourceId,
} from "@/app/api/client/_proxy";

test.each([200, 401, 503])("인증을 포함한 BFF 응답 %s를 캐시하지 않는다", (status) => {
  const response = buildResponse({ ok: status === 200, status, body: "{}", contentType: "application/json", setCookies: [] });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test.each(["../2", "1/2", "%2e%2e", "", "-1", "0", "1.5", "NaN", "9223372036854775808"])("부적절한 리소스 ID %s는 서버로 보내지 않는다", async (id) => {
  const response = validateResourceId(id)!;
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ code: "CLIENT-006" });
});
test("유효한 ID는 정밀도 손실 없이 통과한다", () => {
  expect(validateResourceId("1")).toBeNull();
  expect(validateResourceId("9223372036854775807")).toBeNull();
});

// 자산 public id(As8kLm2Pq9Xz 모양). 경로를 바꾸는 문자는 백엔드에 닿기 전에 막는다.
test.each(["../x", "a/b", "%2e%2e", "", "a b", "x".repeat(65)])("부적절한 공개 ID %s는 서버로 보내지 않는다", async (id) => {
  const response = validatePublicId(id)!;
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "CLIENT-006" });
});
test("유효한 공개 ID는 통과한다", () => {
  expect(validatePublicId("As8kLm2Pq9Xz")).toBeNull();
  expect(validatePublicId("a_b-C")).toBeNull();
});

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
      code: "CLIENT-002",
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

    const forwardedCookie = (
      fetchMock.mock.calls[0][1].headers as Record<string, string>
    ).cookie;
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

    const forwardedCookie = (
      fetchMock.mock.calls[0][1].headers as Record<string, string>
    ).cookie;
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
      code: "CLIENT-003",
      status: 502,
      message: "Failed to reach backend server.",
      data: null,
    });
  });

  // 프록시가 만든 코드가 문구표에 없으면 화면은 원인과 무관한 폴백을 띄운다 — 로그인 화면이라면
  // 백엔드가 죽은 것을 "이메일 또는 비밀번호가 올바르지 않아요" 라고 말한다. 코드만 바꾸고
  // packages/shared/src/api-error-messages.ts 를 안 고치는 회귀를 여기서 잡는다.
  it("only invents codes that the shared message table can translate", async () => {
    const newRequest = () =>
      new Request("http://localhost:3000/api/client/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com" }),
      });

    const misconfigured = await forward(newRequest(), {
      method: "POST",
      url: "undefined/api/harucut/login",
    });

    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const unreachable = await forward(newRequest(), {
      method: "POST",
      url: "https://api.harucut.com/api/harucut/login",
    });

    const crossSite = await forward(
      new Request("http://localhost:3000/api/client/auth/login", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
      { method: "POST", url: "https://api.harucut.com/api/harucut/login" },
    );

    for (const result of [misconfigured, unreachable, crossSite]) {
      const { code } = JSON.parse(result.body) as { code: string };
      // 한글이 섞인 문구여야 한다 — null 이면 폴백으로 떨어지고, 영문이면 화면에 영어가 나간다.
      expect(getApiErrorMessageByCode(code)).toEqual(expect.stringMatching(/[가-힣]/));
    }
  });
  it.each([204, 205, 304])(
    "본문 없는 %i 응답과 쿠키를 그대로 전달한다",
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response(null, {
          status,
          headers: { "set-cookie": "accessToken=renewed; Path=/; HttpOnly" },
        }),
      );
      const response = await proxyJson(
        new Request("https://harucut.com/api/client/logout"),
        {
          method: "DELETE",
          url: "https://api.harucut.com/api/auth/logout",
        },
      );
      expect(response.status).toBe(status);
      expect(response.body).toBeNull();
      expect(response.headers.get("set-cookie")).toContain("accessToken=renewed");
    },
  );

  it("본문 수신이 끊겨도 502 오류 봉투와 갱신 쿠키를 반환한다", async () => {
    const upstream = new Response("partial", {
      headers: { "set-cookie": "refreshToken=renewed; Path=/; HttpOnly" },
    });
    jest.spyOn(upstream, "text").mockRejectedValue(new TypeError("terminated"));
    global.fetch = jest.fn().mockResolvedValue(upstream);
    const response = await proxyJson(
      new Request("https://harucut.com/api/client/reissue"),
      {
        method: "POST",
        url: "https://api.harucut.com/api/auth/reissue",
        forwardBody: false,
      },
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "CLIENT-003",
      status: 502,
    });
    expect(response.headers.get("set-cookie")).toContain("refreshToken=renewed");
  });
});

// 프록시는 쿠키를 싣고 Content-Type 을 JSON 으로 고쳐 보내서, 남의 사이트의 text/plain 폼도
// 사전 요청 없이 로그인까지 닿는다(로그인 CSRF). 우리 화면의 요청은 그대로 지나가야 한다.
describe("client proxy cross-site guard", () => {
  const originalFetch = global.fetch;
  const LOGIN = {
    method: "POST",
    url: "https://api.harucut.com/api/harucut/login",
    stripAuthCookies: true,
  } as const;

  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "GEN-000" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const loginRequest = (
    headers: Record<string, string>,
    url = "https://harucut.com/api/client/auth/login",
  ) =>
    new Request(url, {
      method: "POST",
      headers: { "content-type": "text/plain", ...headers },
      body: '{"email":"attacker@example.com","password":"x"}',
    });

  it("다른 사이트의 POST 는 백엔드로 보내지 않고 403 CLIENT-005 로 막는다", async () => {
    const result = await forward(
      loginRequest({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }),
      LOGIN,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, status: 403, setCookies: [] });
    expect(JSON.parse(result.body)).toEqual({
      code: "CLIENT-005",
      status: 403,
      message: "Cross-site request blocked.",
      data: null,
    });
  });

  // 구형 브라우저·https 가 아닌 주소에는 Sec-Fetch-Site 가 없다. "null" 은 샌드박스 iframe 이 보낸다.
  it.each(["https://evil.example", "null"])(
    "Sec-Fetch-Site 가 없으면 Origin(%s)이 다를 때 막는다",
    async (origin) => {
      const result = await forward(loginRequest({ origin }), LOGIN);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.status).toBe(403);
    },
  );

  // 하위 도메인도 남이다 — 우리 화면은 늘 상대 경로로 부르니 same-site 로 올 정당한 요청이 없다.
  it("Sec-Fetch-Site 가 same-site 여도 막는다", async () => {
    const result = await forward(
      loginRequest({ "sec-fetch-site": "same-site", origin: "https://api.harucut.com" }),
      LOGIN,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ code: "CLIENT-005" });
  });

  it.each(["same-origin", "none"])(
    "Sec-Fetch-Site 가 %s 면 그대로 보낸다",
    async (site) => {
      const result = await forward(
        loginRequest({ "sec-fetch-site": site, origin: "https://harucut.com" }),
        LOGIN,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "POST",
        body: '{"email":"attacker@example.com","password":"x"}',
      });
      expect(result.status).toBe(200);
    },
  );

  it("Sec-Fetch-Site 가 없어도 같은 출처의 Origin 이면 보낸다", async () => {
    await forward(loginRequest({ origin: "https://harucut.com" }), LOGIN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 자체 호스팅 Next 의 route 는 req.url 이 Host 와 무관하게 localhost 다. 에뮬레이터가 띄운 개발 웹
  // (http://10.0.2.2:3000)은 https 가 아니라 Sec-Fetch-Site 도 없다 — req.url 과 맞대면 전부 막힌다.
  it("Origin 은 req.url 이 아니라 브라우저가 부른 주소(Host)와 맞춘다", async () => {
    await forward(
      loginRequest(
        { origin: "http://10.0.2.2:3000", host: "10.0.2.2:3000" },
        "http://localhost:3000/api/client/auth/login",
      ),
      LOGIN,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("GET 은 다른 사이트에서 와도 보낸다", async () => {
    await forward(
      new Request("https://harucut.com/api/client/terms", {
        headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
      }),
      { method: "GET", url: "https://api.harucut.com/api/terms", forwardBody: false },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("행사 경로의 자격 전달(eventCredential)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function upstream() {
    return jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "GEN-000" }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "accessToken=from-backend; Path=/" },
      }),
    );
  }

  function sentHeaders(fetchMock: jest.Mock) {
    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  }

  // F48·O34 — 만료된 회원 쿠키가 참가 요청을 401 로 만들거나, 회원 자격이 참가자 자격을 대신하면 안 된다.
  it.each([
    ["participant", "x-participant-token", "p-token"],
    ["booth", "x-booth-token", "b-token"],
    ["result", "authorization", "Bearer r-token"],
  ] as const)("%s 자격은 쿠키를 하나도 넘기지 않고 %s 헤더만 넘긴다", async (credential, header, value) => {
    const fetchMock = upstream();
    global.fetch = fetchMock;
    const req = new Request("http://localhost:3000/api/client/participant/session", {
      method: "GET",
      headers: {
        cookie: "accessToken=member; refreshToken=member; guestTrial=1",
        [header]: value,
        "x-participant-token": header === "x-participant-token" ? value : "should-not-forward",
      },
    });

    await forward(req, { method: "GET", url: "https://api.harucut.com/api/x", eventCredential: credential });

    const headers = sentHeaders(fetchMock);
    expect(headers.cookie).toBeUndefined();
    expect(headers[header]).toBe(value);
    for (const other of ["x-participant-token", "x-booth-token", "authorization"]) {
      if (other !== header) expect(headers[other]).toBeUndefined();
    }
  });

  it("공개 행사 경로(none)는 쿠키도 자격 헤더도 넘기지 않는다", async () => {
    const fetchMock = upstream();
    global.fetch = fetchMock;
    const req = new Request("http://localhost:3000/api/client/public/events/wedding", {
      headers: { cookie: "accessToken=member", authorization: "Bearer member-jwt" },
    });

    await forward(req, { method: "GET", url: "https://api.harucut.com/api/public/events/wedding", eventCredential: "none" });

    const headers = sentHeaders(fetchMock);
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  it("백엔드가 심으려는 쿠키를 브라우저로 돌려주지 않는다", async () => {
    global.fetch = upstream();
    const req = new Request("http://localhost:3000/api/client/participant/session");
    const res = await proxyJson(req, { method: "GET", url: "https://api.harucut.com/api/x", eventCredential: "participant" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("결과 응답에는 no-referrer 와 no-store 를 붙인다", async () => {
    global.fetch = upstream();
    const req = new Request("http://localhost:3000/api/client/public/results", {
      headers: { authorization: "Bearer r-token" },
    });
    const res = await proxyJson(req, { method: "GET", url: "https://api.harucut.com/api/public/results", eventCredential: "result" });
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("행사 경로 식별자 검사", () => {
  it.each(["evt_01HZ", "a-b_c", "K7QM3XRP"])("공개 식별자 %s 는 통과한다", (id) => {
    expect(validatePublicId(id)).toBeNull();
  });
  it.each(["../x", "a/b", "", "a b", "%2e"])("공개 식별자 %s 는 막는다", (id) => {
    expect(validatePublicId(id)?.status).toBe(400);
  });
  it.each(["wedding-1027", "abc"])("slug %s 는 통과한다", (slug) => {
    expect(validateEventSlug(slug)).toBeNull();
  });
  it.each(["ab", "Wedding", "a_b", "x".repeat(41)])("slug %s 는 막는다", (slug) => {
    expect(validateEventSlug(slug)?.status).toBe(400);
  });
});
