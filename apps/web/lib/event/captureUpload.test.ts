/** @jest-environment node */

import { ApiRequestError } from "@/lib/clientApi";
import { uploadCaptureInput } from "@/lib/event/captureUpload";

const mockIntent = jest.fn();
const mockComplete = jest.fn();
jest.mock("@/lib/event/eventApi", () => ({
  createCaptureUploadIntent: (...a: unknown[]) => mockIntent(...a),
  completeCaptureUpload: (...a: unknown[]) => mockComplete(...a),
}));

const photo = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
const args = { token: "p", eventId: "evt", captureRunId: "run", slotIndex: 1, photo };

describe("uploadCaptureInput", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIntent.mockResolvedValue({
      assetId: "asset-1",
      uploadUrl: "https://bucket.s3.amazonaws.com/uploads/x?X-Amz-Signature=s",
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "If-None-Match": "*", "Content-Length": "10", Host: "bucket" },
      expiresAt: "x",
    });
    mockComplete.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("서버가 준 헤더로 PUT 하되 브라우저가 정하는 헤더는 넣지 않고, 쿠키를 보내지 않는다", async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(uploadCaptureInput(args)).resolves.toBe("asset-1");

    expect(mockIntent).toHaveBeenCalledWith("p", "evt", {
      captureRunId: "run",
      slotIndex: 1,
      contentType: "JPEG",
      fileSize: photo.size,
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Headers;
    expect(headers.get("If-None-Match")).toBe("*");
    expect(headers.get("Content-Type")).toBe("image/jpeg");
    expect(headers.has("Content-Length")).toBe(false);
    expect(headers.has("Host")).toBe(false);
    expect(init.credentials).toBe("omit");
    expect(mockComplete).toHaveBeenCalledWith("p", "asset-1");
  });

  // R5 16절 — 첫 성공 응답을 잃은 뒤의 412 는 무조건 성공도 실패도 아니다. complete 가 실제 객체를 검증한다.
  it("PUT 이 412 면 다시 올리지 않고 complete 로 확인한다", async () => {
    const fetchMock = jest.fn(async () => new Response(null, { status: 412 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(uploadCaptureInput(args)).resolves.toBe("asset-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("PUT 이 그 밖의 오류면 complete 를 부르지 않고 던진다", async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch;
    await expect(uploadCaptureInput(args)).rejects.toMatchObject({ status: 403 });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("검증 대기(ASSET-006)면 같은 complete 를 잠시 뒤 다시 부른다", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    mockComplete
      .mockRejectedValueOnce(new ApiRequestError({ status: 503, code: "ASSET-006" }))
      .mockResolvedValueOnce({});

    const pending = uploadCaptureInput(args);
    await jest.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBe("asset-1");
    expect(mockComplete).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("검증 실패(ASSET-003)는 다시 부르지 않고 던진다", async () => {
    global.fetch = jest.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    mockComplete.mockRejectedValue(new ApiRequestError({ status: 422, code: "ASSET-003" }));
    await expect(uploadCaptureInput(args)).rejects.toMatchObject({ code: "ASSET-003" });
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});
