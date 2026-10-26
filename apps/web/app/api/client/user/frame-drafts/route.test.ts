/** @jest-environment node */

type Route = typeof import("@/app/api/client/user/frame-drafts/route");

describe("GET /api/client/user/frame-drafts", () => {
  const originalFetch = global.fetch;
  let GET: Route["GET"];

  // BASE_URL 은 모듈을 불러올 때 읽는다 — 값을 넣은 뒤에 불러온다.
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://api.example.com";
    ({ GET } = await import("@/app/api/client/user/frame-drafts/route"));
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 서버는 숫자도 `new` 도 아니면 400 GEN-005 다. 경로를 바꾸는 값은 백엔드에 닿기 전에 막는다.
  it.each(["../1", "abc", "0"])("frameId=%s 는 서버로 보내지 않는다", async (frameId) => {
    global.fetch = jest.fn();
    const res = await GET(new Request(`http://localhost/api/client/user/frame-drafts?frameId=${encodeURIComponent(frameId)}`));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(["new", "7"])("frameId=%s 는 그대로 넘긴다", async (frameId) => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "GEN-000", status: 200, data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await GET(new Request(`http://localhost/api/client/user/frame-drafts?frameId=${frameId}`));
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toMatch(
      new RegExp(`/api/auth/user/frame-drafts\\?frameId=${frameId}$`),
    );
  });
});
