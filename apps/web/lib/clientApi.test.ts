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
        new Response(JSON.stringify({ code: "SUBS-003", status: 403, message: "…" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(clientApi.get("/api/client/user/frame")).rejects.toMatchObject({
      code: "SUBS-003",
    });
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

    const error = await clientApi.get("/api/client/user-info").then(
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

  it("응답 본문을 읽다가 연결이 끊겨도 CLIENT-004로 안내한다", async () => {
    const response = new Response("{}");
    jest.spyOn(response, "text").mockRejectedValue(new TypeError("terminated"));
    global.fetch = jest.fn().mockResolvedValue(response);
    await expect(clientApi.get("/api/client/user-info")).rejects.toMatchObject({
      code: CLIENT_NETWORK_UNREACHABLE_CODE,
    });
  });

  it("응답 본문을 읽던 중 취소되면 AbortError를 보존한다", async () => {
    const aborted = new DOMException("Aborted", "AbortError");
    const response = new Response("{}");
    jest.spyOn(response, "text").mockRejectedValue(aborted);
    global.fetch = jest.fn().mockResolvedValue(response);
    await expect(clientApi.get("/api/client/user-info")).rejects.toBe(aborted);
  });

  // 취소는 실패가 아니다. 코드를 붙이면 사용자가 스스로 끊은 요청이 오류 문구로 바뀐다.
  it("취소(AbortError)는 손대지 않고 그대로 던진다", async () => {
    const aborted = new DOMException("Aborted", "AbortError");
    global.fetch = jest.fn(async () => {
      throw aborted;
    }) as unknown as typeof fetch;

    const error = await clientApi.get("/api/client/user-info").then(
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

  /*
    회귀 — **호출부의 종료 상한이 재발급 왕복까지 닿는다.**

    이 fetch 는 한때 signal 없이 돌았다. 그래서 삭제 API 처럼 상한을 건 호출부가 401 을
    받은 뒤 재발급이 응답 없이 멈추면 상한이 먹지 않고 요청 전체가 영영 안 끝났다 —
    그 사이 확인 다이얼로그는 취소·배경·Escape 가 전부 막힌 감옥이 된다
    (components/ui/ConfirmDialog.tsx, lib/userMediaApi.ts 의 DELETE_DEADLINE_MS).
  */
  it("재발급이 멈춰도 호출부의 상한으로 끊긴다", async () => {
    const controller = new AbortController();

    global.fetch = jest.fn(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          if (urlOf(input) !== "/api/client/reissue") {
            resolve(new Response("{}", { status: 401 }));
            return;
          }
          /*
            재발급은 답도 실패도 주지 않는다 — signal 이 닿아야만 끝난다.
            진짜 `fetch` 처럼 **이미 끊긴 signal 도** 그 자리에서 거절한다. 리스너만 달면
            끊긴 뒤에 부른 경우를 못 잡아, 여기서 영영 안 끝난다.
          */
          const abort = () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init?.signal?.aborted) {
            abort();
            return;
          }
          init?.signal?.addEventListener("abort", abort);
        }),
    ) as unknown as typeof fetch;

    jest.useFakeTimers();
    try {
      const pending = clientApi.get("/api/client/user-info", {
        signal: controller.signal,
      });
      controller.abort();

      // 사용자의 취소를 세션 장애로 바꾸지 않는다. 공유 재발급 자체는 계속된다.
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });

      /*
        **공유 슬롯을 비워 두고 나간다.** 호출부는 끊겼지만 왕복은 자기 상한(30초)까지
        계속 도는데(슬롯은 그때 풀린다 — 그래야 아직 도는 왕복과 새 왕복이 나란히 돌지
        않는다), 그대로 두면 이 파일의 뒤 테스트들이 그 왕복을 물고 멈춘다.
      */
      await jest.advanceTimersByTimeAsync(31_000);
    } finally {
      jest.useRealTimers();
    }
  });

  /*
    회귀 — **재발급은 탭에 하나뿐이다.**

    `reissue` 는 refresh 를 회전시킨다. 같은 쿠키로 둘이 동시에 부르면 서버가 둘 다 받아
    회전 응답 순서에 따라 한쪽이 무효가 되고, 그쪽 호출부는 멀쩡한 세션을 끊긴 것으로 읽는다.
    실제로 나던 자리: 행사 주소로 들어온 회원에게 프레임 조회와 회원 판정이 나란히
    시작되고, access 가 만료돼 있으면 둘 다 401 을 받아 재발급이 두 번 나갔다. 판정 쪽이
    진 경우 회원이 게스트로 읽혀 7일짜리 체험 쿠키가 심겼다.
  */
  it("동시에 401 을 받아도 재발급은 한 번만 나간다", async () => {
    let reissueCalls = 0;
    let releaseReissue: () => void = () => {};
    const reissueStarted = new Promise<void>((resolve) => {
      releaseReissue = resolve;
    });

    const attempts = new Map<string, number>();
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url === "/api/client/reissue") {
        reissueCalls += 1;
        // 첫 호출을 붙잡아 둔다 — 그 사이 두 번째 요청도 401 을 받아 여기 닿는다.
        releaseReissue();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response("{}", { status: 200 });
      }
      const seen = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, seen);
      // 각 경로의 첫 시도만 401. 재발급 뒤의 재시도는 성공한다.
      return new Response("{}", { status: seen === 1 ? 401 : 200 });
    }) as unknown as typeof fetch;

    const first = clientApi.get("/api/client/user/frame");
    await reissueStarted;
    const second = clientApi.get("/api/auth/status");

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });

    // 고치기 전에는 여기가 2였다 — 같은 refresh 쿠키로 회전이 두 번 나갔다.
    expect(reissueCalls).toBe(1);
  });

  /*
    반대쪽 못 — 붙잡아 두는 것이 **한 회차뿐**이라는 것. 앞 회차가 끝난 뒤의 401 은 새로
    재발급을 부른다. 이 못이 없으면 「한 번 부르고 영영 다시 안 부른다」로 고쳐도 통과한다.
  */
  it("앞 재발급이 끝난 뒤의 401 은 다시 재발급한다", async () => {
    let reissueCalls = 0;
    let calls = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (urlOf(input) === "/api/client/reissue") {
        reissueCalls += 1;
        return new Response("{}", { status: 200 });
      }
      // 회차마다 첫 시도는 401, 재발급 뒤의 재시도는 200.
      calls += 1;
      return new Response("{}", { status: calls % 2 === 1 ? 401 : 200 });
    }) as unknown as typeof fetch;

    await clientApi.get("/api/client/user-info");
    await clientApi.get("/api/client/user-info");

    expect(reissueCalls).toBe(2);
  });

  /*
    회귀 — **멈춘 재발급이 탭을 영원히 막지 않는다.**

    재발급을 하나로 묶었으므로, 상한 없는 호출부(`resolveMembership`·`useMyFrames`)가 먼저
    붙은 채 왕복이 멈추면 기다리는 쪽이 정리되지 않는다. 그러면 회선이 돌아온 뒤의 모든
    401 이 그 멈춘 약속만 기다려 새로고침 전까지 인증 API 가 통째로 선다.
    공유 재발급 자체에 종료 상한이 있어야 풀린다.
  */
  it("멈춘 재발급은 상한에 걸려 다음 요청을 막지 않는다", async () => {
    jest.useFakeTimers();
    try {
      let reissueCalls = 0;
      let stall = true;
      // 액세스가 만료된 상태. 재발급이 성공하면 풀린다.
      let needsAuth = true;
      global.fetch = jest.fn(
        (input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            if (urlOf(input) !== "/api/client/reissue") {
              resolve(new Response("{}", { status: needsAuth ? 401 : 200 }));
              return;
            }
            reissueCalls += 1;
            if (!stall) {
              needsAuth = false;
              resolve(new Response("{}", { status: 200 }));
              return;
            }
            // 답도 실패도 주지 않는다 — 자체 상한만이 이것을 끝낼 수 있다.
            const abort = () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            };
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener("abort", abort);
          }),
      ) as unknown as typeof fetch;

      // 상한 없는 호출부가 먼저 붙는다.
      const stuck = clientApi.get("/api/auth/status").catch(() => "failed");
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(31_000);
      await expect(stuck).resolves.toBe("failed");
      expect(reissueCalls).toBe(1);

      // 회선이 돌아온 뒤의 401 은 **새 재발급**을 보낸다.
      stall = false;
      needsAuth = true;
      await expect(clientApi.get("/api/client/user-info")).resolves.toMatchObject({
        ok: true,
      });
      // 고치기 전에는 여기가 1 이었다 — 멈춘 약속을 그대로 물고 있었다.
      expect(reissueCalls).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
