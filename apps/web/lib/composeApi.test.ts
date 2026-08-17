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
  isComposeUnavailable,
  newIdempotencyKey,
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

beforeEach(() => {
  jest.clearAllMocks();
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

  it("계속 PENDING 이면 상한에서 끊는다 — 사용자를 빈 화면에 세워 두지 않는다", async () => {
    mockGet.mockResolvedValue(envelope({ jobId: 1, status: "PENDING" }));

    await expect(
      waitForCompose(1, { intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(ComposeTimeoutError);
  });

  it("진행 상황을 알려 준다", async () => {
    mockGet
      .mockResolvedValueOnce(envelope({ jobId: 1, status: "PENDING" }))
      .mockResolvedValueOnce(envelope({ jobId: 1, status: "DONE", mediaId: 3 }));

    const seen: string[] = [];
    await waitForCompose(1, { intervalMs: 0, onTick: (job) => seen.push(job.status) });

    expect(seen).toEqual(["PENDING", "DONE"]);
  });
});

describe("isComposeUnavailable", () => {
  // 배포본에는 이 엔드포인트가 아직 없다 — 404 GEN-031 이 온다(존재하지 않는 경로와 같은 응답).
  // 그 경우에만 기존 클라이언트 합성으로 되돌아가고, 다른 실패는 실패로 다룬다.
  it("404 는 '이 백엔드에 아직 없음'으로 본다", () => {
    expect(isComposeUnavailable({ status: 404, code: "GEN-031" })).toBe(true);
  });

  it("권한·서버 오류는 폴백 사유가 아니다", () => {
    expect(isComposeUnavailable({ status: 401 })).toBe(false);
    expect(isComposeUnavailable({ status: 403 })).toBe(false);
    expect(isComposeUnavailable({ status: 500 })).toBe(false);
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
    expect(mockGet).toHaveBeenCalledWith("/api/client/user/media/compose/9");
  });
});
