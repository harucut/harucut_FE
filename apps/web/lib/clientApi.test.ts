/** @jest-environment node */

import {
  clientApi,
  registerDeletionRequestedHandler,
} from "@/lib/clientApi";

// 실제 응답 형태 그대로(2026-08-20 실측, docs/backend-contract.md).
function accessDenied() {
  return new Response(
    JSON.stringify({
      code: "GEN-021",
      status: 403,
      message: "Access denied.",
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

function authStatus(userStatus: string) {
  return new Response(
    JSON.stringify({ code: "GEN-000", status: 200, data: { userStatus } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : String(input);
}

// 상태 확인은 원요청과 별개로 도는 곁가지라 await 대상이 없다. 매크로태스크 한 번으로
// 대기 중인 마이크로태스크를 전부 흘려보낸다(틱 수를 세지 않기 위해).
function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("clientApi — 탈퇴요청(GEN-021) 감지", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    registerDeletionRequestedHandler(null);
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("403 GEN-021 이면 상태를 확인하고 복구 핸들러를 부른다", async () => {
    const onDeletionRequested = jest.fn();
    registerDeletionRequestedHandler(onDeletionRequested);

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (urlOf(input) === "/api/auth/status") {
        return authStatus("DELETED_REQUESTED");
      }
      return accessDenied();
    }) as unknown as typeof fetch;

    await expect(clientApi.get("/api/client/user-info")).rejects.toMatchObject({
      status: 403,
      code: "GEN-021",
    });

    await flushAsync();

    expect(onDeletionRequested).toHaveBeenCalledTimes(1);
  });

  // GEN-021 은 인가 거부 전반에 쓰이는 코드다. 상태가 ACTIVE 면 그냥 권한 부족이므로
  // 복구 화면으로 보내면 안 된다.
  it("상태가 ACTIVE 면 복구 핸들러를 부르지 않는다", async () => {
    const onDeletionRequested = jest.fn();
    registerDeletionRequestedHandler(onDeletionRequested);

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (urlOf(input) === "/api/auth/status") return authStatus("ACTIVE");
      return accessDenied();
    }) as unknown as typeof fetch;

    await expect(clientApi.get("/api/client/user-info")).rejects.toBeDefined();
    await flushAsync();

    expect(onDeletionRequested).not.toHaveBeenCalled();
  });

  // 상태 조회 자체가 403 이면 다시 상태를 조회하러 가서 무한히 돈다.
  it("상태 조회·탈퇴 취소 경로는 다시 검사하지 않는다", async () => {
    const fetchMock = jest.fn(async () => accessDenied());
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(clientApi.get("/api/auth/status")).rejects.toBeDefined();
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("403 이어도 코드가 GEN-021 이 아니면 상태를 조회하지 않는다", async () => {
    const fetchMock = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ code: "SUBS-003", status: 403, message: "…" }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(clientApi.get("/api/client/user/frame")).rejects.toMatchObject(
      { code: "SUBS-003" },
    );
    await flushAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
