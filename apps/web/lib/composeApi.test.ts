/**
 * 서버 합성 클라이언트.
 *
 * 계약은 로컬 백엔드로 실측했다(레포 main 을 직접 빌드해 8090 에 띄움):
 *   POST → 202 {"jobId":1,"status":"PENDING"} · 같은 idempotencyKey 재요청 → 같은 jobId
 *   GET  → 1초 뒤 PENDING, 2초 뒤 {"status":"DONE","mediaId":1}
 *   결과 이미지 4000×6000 PNG(24.0MP), 슬롯 4칸 색 일치
 */
import {
  ComposeFailedError,
  ComposeTimeoutError,
  getComposeJob,
  newIdempotencyKey,
  POLL_REQUEST_DEADLINE_MS,
  requestCompose,
  waitForCompose,
} from "@/lib/composeApi";
import { clientApi } from "@/lib/clientApi";

jest.mock("@/lib/clientApi", () => ({
  clientApi: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = clientApi.get as jest.Mock;
const mockPost = clientApi.post as jest.Mock;

const envelope = (data: unknown) => ({ data: { data } });

const abortError = () => new DOMException("Aborted", "AbortError");

/**
 * 응답이 오지 않는 조회. signal 이 끊길 때만 깨진다.
 *
 * 제품에서는 signal 이 없으면 이 프라미스가 **영영** 안 끝난다 — 이 회귀의 내용이 바로
 * 그것이다. 테스트에서 그대로 재현하면 jest 제한 시간에 걸려 죽을 뿐 무엇이 틀렸는지
 * 안 남아서, signal 이 안 왔다는 사실을 오류 문구로 남기고 즉시 접는다.
 */
function hangUntilAborted(_path: string, options?: { signal?: AbortSignal }) {
  const signal = options?.signal;

  return new Promise((_resolve, reject) => {
    if (!signal) {
      reject(new Error("조회 요청에 signal 이 없다 — 상한도 취소도 걸 수 없다"));
      return;
    }
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

/**
 * 아직 안 끝난 프라미스를 fake timer 안에서 보기 위한 감시자.
 *
 * `await` 로 기다리면 상한이 안 걸렸을 때 테스트가 그냥 멈춰 버려서, 무엇이 깨졌는지
 * 안 남는다 — 끝났는지 **물어보는** 쪽으로 뒤집는다.
 */
function watch<T>(promise: Promise<T>) {
  const seen: { settled: boolean; value?: T; error?: unknown } = {
    settled: false,
  };

  promise.then(
    (value) => {
      seen.settled = true;
      seen.value = value;
    },
    (error) => {
      seen.settled = true;
      seen.error = error;
    },
  );

  return seen;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("requestCompose", () => {
  it("접수 응답의 jobId 와 상태를 그대로 돌려준다", async () => {
    mockPost.mockResolvedValue(envelope({ jobId: 1, status: "PENDING" }));

    const job = await requestCompose({
      frameId: 2,
      sourceKeys: ["a", "b", "c", "d"],
      idempotencyKey: "web-x",
    });

    expect(job).toEqual({ jobId: 1, status: "PENDING" });
    expect(mockPost).toHaveBeenCalledWith("/api/client/user/media/compose", {
      frameId: 2,
      sourceKeys: ["a", "b", "c", "d"],
      idempotencyKey: "web-x",
    });
  });
});

describe("waitForCompose", () => {
  it("DONE 이 될 때까지 폴링하고 mediaId 를 돌려준다", async () => {
    mockGet
      .mockResolvedValueOnce(envelope({ jobId: 1, status: "PENDING" }))
      .mockResolvedValueOnce(envelope({ jobId: 1, status: "PENDING" }))
      .mockResolvedValueOnce(envelope({ jobId: 1, status: "DONE", mediaId: 7 }));

    const job = await waitForCompose(1, { intervalMs: 0 });

    expect(job.mediaId).toBe(7);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it("FAILED 면 서버가 준 사유로 던진다", async () => {
    mockGet.mockResolvedValue(
      envelope({ jobId: 1, status: "FAILED", failureReason: "원본을 읽지 못했다" }),
    );

    await expect(waitForCompose(1, { intervalMs: 0 })).rejects.toBeInstanceOf(
      ComposeFailedError,
    );
    await expect(waitForCompose(1, { intervalMs: 0 })).rejects.toThrow(
      "원본을 읽지 못했다",
    );
  });

  it("계속 PENDING 이면 총 상한에서 끊는다 — 사용자를 빈 화면에 세워 두지 않는다", async () => {
    jest.useFakeTimers();
    mockGet.mockResolvedValue(envelope({ jobId: 1, status: "PENDING" }));

    const seen = watch(waitForCompose(1, { intervalMs: 1_000, timeoutMs: 5_000 }));

    await jest.advanceTimersByTimeAsync(4_000);
    expect(seen.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1_000);
    expect(seen.error).toBeInstanceOf(ComposeTimeoutError);
  });

  it("남은 시간이 없으면 새 조회를 내지 않는다", async () => {
    mockGet.mockResolvedValue(envelope({ jobId: 1, status: "PENDING" }));

    await expect(
      waitForCompose(1, { intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ComposeTimeoutError);
    // 예산이 0 인데 요청을 내면 그 요청은 아무도 안 기다리는 왕복이 된다.
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("조회마다 signal 을 건다 — 안 걸면 멈춘 요청을 끊을 길이 없다", async () => {
    mockGet.mockResolvedValue(envelope({ jobId: 1, status: "DONE", mediaId: 3 }));

    await waitForCompose(1, { intervalMs: 0 });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/client/user/media/compose/1",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  /*
    한 번 왕복에 상한을 건 이유는 「답이 안 오는 요청에 매달리지 않는다」이지 「그러면
    포기한다」가 아니다. 예전에는 그 요청에 영영 매달려 90초가 세어지지도 않았고, 상한만
    붙였을 때는 반대로 30초짜리 멈춤 하나가 60초 남은 예산을 통째로 버렸다 — 합성은 서버에서
    멀쩡히 끝나 가는데 화면만 먼저 실패로 접는 셈이다.
  */
  it("조회 하나가 안 끝나면 그 요청만 접고 다음 바퀴로 넘어간다", async () => {
    jest.useFakeTimers();
    let calls = 0;
    mockGet.mockImplementation((path: string, options?: { signal?: AbortSignal }) => {
      calls += 1;
      // 첫 조회만 답이 없다. 두 번째는 정상으로 끝난다.
      if (calls === 1) return hangUntilAborted(path, options);
      return Promise.resolve(envelope({ jobId: 1, status: "DONE", mediaId: 9 }));
    });

    const seen = watch(waitForCompose(1, { intervalMs: 0 }));

    await jest.advanceTimersByTimeAsync(POLL_REQUEST_DEADLINE_MS - 1);
    expect(seen.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(1);

    // 고치기 전에는 여기서 ComposeTimeoutError 로 끝났다 — 예산이 60초나 남았는데도.
    expect(seen.value).toMatchObject({ status: "DONE", mediaId: 9 });
    expect(calls).toBe(2);
  });

  /*
    반대쪽 못 — 예산이 다 떨어지면 그때는 끊는다. 이 못이 없으면 「멈춘 조회를 무한히
    다시 낸다」로 고쳐도 위 테스트가 통과한다.
  */
  it("멈춘 조회가 이어져도 총 예산이 끝나면 끊는다", async () => {
    jest.useFakeTimers();
    mockGet.mockImplementation(hangUntilAborted);

    const seen = watch(waitForCompose(1, { intervalMs: 0, timeoutMs: 90_000 }));

    await jest.advanceTimersByTimeAsync(90_000);

    // 결과 화면이 재시도 UI 를 띄우는 실패다(fourcutCompose 의 describeComposeFailure 가
    // ComposeTimeoutError 만 retryable 로 읽는다). 다른 오류로 접으면 재시도가 사라진다.
    expect(seen.error).toBeInstanceOf(ComposeTimeoutError);
  });

  it("남은 총 시간이 요청 상한보다 짧으면 남은 쪽에서 끊는다", async () => {
    jest.useFakeTimers();
    mockGet.mockImplementation(hangUntilAborted);

    // 요청 상한(30초)보다 짧은 예산. 요청 상한을 그대로 쓰면 여기서 25초를 더 샌다.
    const budgetMs = 5_000;
    const seen = watch(waitForCompose(1, { intervalMs: 0, timeoutMs: budgetMs }));

    await jest.advanceTimersByTimeAsync(budgetMs);

    expect(seen.error).toBeInstanceOf(ComposeTimeoutError);
  });

  it("사용자가 떠나면 멈춘 조회를 취소한다 — 상한 오류로 바꾸지 않는다", async () => {
    jest.useFakeTimers();
    mockGet.mockImplementation(hangUntilAborted);

    const controller = new AbortController();
    const seen = watch(
      waitForCompose(1, { intervalMs: 0, signal: controller.signal }),
    );

    await jest.advanceTimersByTimeAsync(1_000);
    expect(seen.settled).toBe(false);

    controller.abort();
    await jest.advanceTimersByTimeAsync(0);

    // 취소는 취소로 올린다. ComposeTimeoutError 로 바꾸면 떠난 사람의 실패가 "잠시 후
    // 다시 시도해 주세요"로 읽히고, 호출부의 취소 판정(name === "AbortError")도 깨진다.
    expect((seen.error as Error).name).toBe("AbortError");
    expect(seen.error).not.toBeInstanceOf(ComposeTimeoutError);
  });

  it("정상 응답이면 상한 타이머를 남기지 않는다", async () => {
    jest.useFakeTimers();
    mockGet.mockResolvedValue(envelope({ jobId: 1, status: "DONE", mediaId: 5 }));

    await expect(waitForCompose(1, { intervalMs: 0 })).resolves.toEqual({
      jobId: 1,
      status: "DONE",
      mediaId: 5,
    });
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("newIdempotencyKey", () => {
  it("서버 제약인 64자를 넘지 않는다", () => {
    expect(newIdempotencyKey().length).toBeLessThanOrEqual(64);
  });

  it("호출마다 다르다 — 재시도만 같은 값을 재사용한다", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("getComposeJob", () => {
  it("jobId 로 상태를 읽는다", async () => {
    mockGet.mockResolvedValue(envelope({ jobId: 9, status: "DONE", mediaId: 4 }));

    await expect(getComposeJob(9)).resolves.toEqual({
      jobId: 9,
      status: "DONE",
      mediaId: 4,
    });
    expect(mockGet.mock.calls[0][0]).toBe("/api/client/user/media/compose/9");
  });

  it("넘긴 signal 을 요청에 그대로 건다", async () => {
    mockGet.mockResolvedValue(envelope({ jobId: 9, status: "PENDING" }));
    const { signal } = new AbortController();

    await getComposeJob(9, { signal });

    expect(mockGet).toHaveBeenCalledWith("/api/client/user/media/compose/9", {
      signal,
    });
  });
});
