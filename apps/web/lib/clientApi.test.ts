/** @jest-environment node */

import {
  CLIENT_NETWORK_UNREACHABLE_CODE,
  getApiErrorMessageByCode,
} from "@harucut/shared";

import {
  ApiRequestError,
  clientApi,
  registerDeletionRequestedHandler,
  registerSessionExpiredHandler,
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

// 진짜 오프라인 — 브라우저가 Next 서버에조차 닿지 못해 fetch 가 응답 없이 던지는 구간.
// 프록시의 CLIENT-003 은 요청이 Next 까지 닿은 뒤에야 만들어지므로 여기서는 나올 수 없다.
describe("clientApi — Next 서버에 닿지 못한 경우", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    registerSessionExpiredHandler(null);
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // 브라우저 fetch 는 회선이 끊기면 TypeError("Failed to fetch") 를 던진다.
  it("fetch 가 던지면 CLIENT-004 ApiRequestError 로 바꾼다", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const error = await clientApi
      .get("/api/client/user-info")
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).code).toBe(CLIENT_NETWORK_UNREACHABLE_CODE);
    // 응답이 없었으므로 상태를 지어내지 않는다.
    expect((error as ApiRequestError).status).toBeUndefined();
  });

  // 코드만 있고 문구가 없으면 화면은 결국 폴백을 띄운다 — 짝이 붙어 있는지 같이 잠근다.
  it("그 코드에 대응하는 한국어 문구가 있다", () => {
    expect(getApiErrorMessageByCode(CLIENT_NETWORK_UNREACHABLE_CODE)).toBeTruthy();
  });

  // 취소는 실패가 아니다. 코드를 붙이면 사용자가 스스로 끊은 요청이 오류 문구로 바뀐다.
  it("취소(AbortError)는 손대지 않고 그대로 던진다", async () => {
    const aborted = new DOMException("Aborted", "AbortError");
    global.fetch = jest.fn(async () => {
      throw aborted;
    }) as unknown as typeof fetch;

    const error = await clientApi
      .get("/api/client/user-info")
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBe(aborted);
    expect(error).not.toBeInstanceOf(ApiRequestError);
  });

  // 401 재발급까지는 성공했는데 그 직후 회선이 끊긴 경우. 세션은 멀쩡하므로
  // 만료 핸들러(로그인 유도)를 부르면 안 된다.
  it("재발급 뒤 재시도가 끊겨도 만료가 아니라 CLIENT-004 다", async () => {
    const onSessionExpired = jest.fn();
    registerSessionExpiredHandler(onSessionExpired);

    let attempts = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (urlOf(input) === "/api/client/reissue") {
        return new Response("{}", { status: 200 });
      }
      attempts += 1;
      if (attempts === 1) return new Response("{}", { status: 401 });
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(clientApi.get("/api/client/user-info")).rejects.toMatchObject({
      code: CLIENT_NETWORK_UNREACHABLE_CODE,
    });

    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
