/** @jest-environment node */
/**
 * 회원 판정의 **세 갈래**를 못으로 박는다.
 *
 * 「지금 회원이 아니다」와 「지금은 알 수 없다」를 한 값으로 뭉치면, 서버가 잠깐 못 답한
 * 것만으로 멀쩡한 회원에게 7일짜리 게스트 쿠키가 심긴다(app/shoot/page.tsx 의 행사 전환).
 * 그래서 이 파일은 `clientApi` 를 목으로 덮지 않고 **그 아래 `fetch` 만** 갈아 끼운다 —
 * 401 재발급·재시도와 「재발급 서버가 못 답함」 구분이 판정의 일부라, 목으로 덮으면
 * 지키려는 것이 통째로 테스트 밖으로 나간다.
 *
 * 환경이 node 인 이유: jsdom 에는 `Response` 가 없어 응답을 만들 수 없다.
 * `lib/clientApi.test.ts` 도 같은 이유로 node 다. 이 파일에는 DOM 이 필요 없다.
 */
import { resolveMembership } from "@/lib/authSession";

const originalFetch = global.fetch;

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : String(input);
}

/** `/api/auth/status` 한 벌. `userStatus` 를 주면 본문에 실어 보낸다. */
function statusOk(userStatus?: string) {
  return new Response(
    JSON.stringify(userStatus ? { data: { userStatus } } : { data: {} }),
    { status: 200 },
  );
}

/** 경로별로 답을 정한다. `status` 는 순서대로 소비하고, 마지막 것을 되쓴다. */
function routeFetch(handlers: {
  status: Array<Response | (() => Response)>;
  reissue?: () => Response;
}) {
  const queue = [...handlers.status];
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (urlOf(input) === "/api/client/reissue") {
      return handlers.reissue?.() ?? new Response("{}", { status: 200 });
    }
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("resolveMembership", () => {
  it("200 이고 상태가 멀쩡하면 회원이다", async () => {
    routeFetch({ status: [() => statusOk()] });

    await expect(resolveMembership()).resolves.toBe("member");
  });

  /*
    `/api/auth/status` 는 탈퇴요청·탈퇴·차단 계정에도 200 을 준다(복구 진입로를 열어 둔
    예외다). 그 200 을 회원으로 읽으면 아무것도 못 하는 화면으로 보내게 된다.
  */
  it.each(["DELETED_REQUESTED", "DELETED", "BLOCKED"])(
    "%s 는 200 이어도 회원이 아니다",
    async (userStatus) => {
      routeFetch({ status: [() => statusOk(userStatus)] });

      await expect(resolveMembership()).resolves.toBe("guest");
    },
  );

  // 액세스만 만료된 회원. 재발급이 되면 그대로 회원이다.
  it("401 뒤 재발급에 성공하면 회원이다", async () => {
    routeFetch({
      status: [
        () => new Response("{}", { status: 401 }),
        () => statusOk(),
      ],
    });

    await expect(resolveMembership()).resolves.toBe("member");
  });

  // 재발급까지 해 보고도 401 이면 세션이 정말 끊긴 것이다 — 여기만 확정이다.
  it("재발급해도 401 이면 회원이 아니다", async () => {
    routeFetch({
      status: [() => new Response("{}", { status: 401 })],
      reissue: () => new Response("{}", { status: 401 }),
    });

    await expect(resolveMembership()).resolves.toBe("guest");
  });

  /*
    **여기가 이 파일의 요점이다.** 아래 셋은 「회원이 아니다」가 아니라 「알 수 없다」다.
    이것을 `guest` 로 접으면 서버가 잠깐 흔들린 것만으로 멀쩡한 회원이 뒤집힌다.
  */
  it("상태 조회가 5xx 면 판정할 수 없다", async () => {
    routeFetch({ status: [() => new Response("{}", { status: 503 })] });

    await expect(resolveMembership()).resolves.toBe("unknown");
  });

  it("회선이 안 닿으면 판정할 수 없다", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(resolveMembership()).resolves.toBe("unknown");
  });

  it("재발급 서버만 못 답해도 판정할 수 없다", async () => {
    routeFetch({
      status: [() => new Response("{}", { status: 401 })],
      // 401·403 이 아닌 실패는 `clientApi` 가 「재시도 가능」으로 바꿔 던진다.
      reissue: () => new Response("{}", { status: 500 }),
    });

    await expect(resolveMembership()).resolves.toBe("unknown");
  });

  /*
    회귀 — **답이 안 와도 끝난다.**

    상한이 없으면 이 함수가 영영 안 끝나고, 그것을 기다리는 화면은 잠긴 채로 남는다
    (업로드 화면). 「다시 확인」 안내도 못 뜬다 — 그 안내는 `unknown` 이 돌아와야 뜬다.
  */
  it("상태 조회가 멈추면 상한에 걸려 판정할 수 없다고 답한다", async () => {
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            };
            if (init?.signal?.aborted) abort();
            else init?.signal?.addEventListener("abort", abort);
          }),
      ) as unknown as typeof fetch;

      const pending = resolveMembership();
      await jest.advanceTimersByTimeAsync(31_000);

      await expect(pending).resolves.toBe("unknown");
    } finally {
      jest.useRealTimers();
    }
  });
});
