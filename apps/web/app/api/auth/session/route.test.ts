/** @jest-environment node */

// 라우트 모듈이 로드 시점에 NEXT_PUBLIC_BASE_URL 을 읽으므로 import 보다 먼저 심어야 한다.
process.env.NEXT_PUBLIC_BASE_URL = "https://api.example.test";

type SessionRoute = typeof import("@/app/api/auth/session/route");
let GET: SessionRoute["GET"];

beforeAll(async () => {
  ({ GET } = await import("@/app/api/auth/session/route"));
});

// 실제 백엔드 응답 형태를 그대로 쓴다(2026-08-20 실측, docs/backend-contract.md).
function statusResponse(userStatus: string, status = 200) {
  return new Response(
    JSON.stringify({ code: "GEN-000", status, data: { userStatus } }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function sessionRequest() {
  return new Request("http://localhost:3000/api/auth/session");
}

describe("GET /api/auth/session", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("treats an ACTIVE account as authenticated", async () => {
    global.fetch = jest.fn().mockResolvedValue(statusResponse("ACTIVE"));

    const body = await (await GET(sessionRequest())).json();

    expect(body).toEqual({ authenticated: true, userStatus: "ACTIVE" });
  });

  // 백엔드는 탈퇴요청 계정에도 /api/auth/status 만은 200 을 준다(복구 진입로를 남기려고).
  // 그걸 그대로 authenticated 로 읽으면 로그인 화면이 그 사용자를 /home 으로 쫓아내는데,
  // /home 의 모든 요청은 403(GEN-021)이라 다시 로그인으로 돌아온다 — 무한 왕복.
  it("does not call a DELETED_REQUESTED account authenticated even though status returns 200", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(statusResponse("DELETED_REQUESTED"));

    const body = await (await GET(sessionRequest())).json();

    expect(body).toEqual({
      authenticated: false,
      userStatus: "DELETED_REQUESTED",
    });
  });

  it.each(["DELETED", "BLOCKED"])(
    "does not call a %s account authenticated",
    async (userStatus) => {
      global.fetch = jest.fn().mockResolvedValue(statusResponse(userStatus));

      const body = await (await GET(sessionRequest())).json();

      expect(body.authenticated).toBe(false);
      expect(body.userStatus).toBe(userStatus);
    },
  );

  // 상태를 못 읽었다고 멀쩡한 사용자를 로그아웃시키면 안 된다 — 응답 형태가 조금만 바뀌어도
  // 전원이 로그인 화면으로 쫓겨난다. 모르면 예전처럼 200 을 믿는다.
  it("falls back to trusting a 200 when userStatus is missing", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "GEN-000", status: 200 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const body = await (await GET(sessionRequest())).json();

    expect(body).toEqual({ authenticated: true, userStatus: null });
  });

  it("is unauthenticated when the backend rejects the request", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "AUTH-010", status: 401, message: "…" }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const body = await (await GET(sessionRequest())).json();

    expect(body).toEqual({ authenticated: false, userStatus: null });
  });
});
