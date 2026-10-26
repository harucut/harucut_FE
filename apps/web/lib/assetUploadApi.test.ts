const mockPost = jest.fn();
const mockDecode = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock("@/lib/imageDecode", () => ({
  decodeImageFile: (...args: unknown[]) => mockDecode(...args),
}));

import { toAssetFile, uploadAsset } from "@/lib/assetUploadApi";
import { UploadValidationError } from "@/lib/presignedUploadApi";

const INTENT = {
  assetId: "As1",
  uploadUrl: "https://s3.example.com/put?sig=x",
  method: "PUT",
  headers: { "Content-Type": "image/png", "If-None-Match": "*" },
};

function ok<T>(data: T) {
  return { data: { code: "GEN-000", status: 200, data } };
}

function apiError(code: string, status: number) {
  return Object.assign(new Error(code), { code, status });
}

describe("uploadAsset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("의도 → 받은 헤더 그대로 PUT → 완료 확인 순서로 올린다", async () => {
    mockPost
      .mockResolvedValueOnce(ok(INTENT))
      .mockResolvedValueOnce(ok({ assetId: "As1", status: "VERIFIED", key: "uploads/a.png" }));
    const file = new File(["png"], "sticker.png", { type: "image/png" });

    await expect(uploadAsset({ file, purpose: "FRAME_ASSET" })).resolves.toEqual({
      assetId: "As1",
      key: "uploads/a.png",
    });

    expect(mockPost).toHaveBeenNthCalledWith(1, "/api/client/assets/upload-intents", {
      purpose: "FRAME_ASSET",
      contentType: "PNG",
      filename: "sticker.png",
      fileSize: file.size,
    });
    // 헤더는 서명에 들어 있다 — 하나라도 빼면 S3 가 403 이다.
    expect(global.fetch).toHaveBeenCalledWith(
      INTENT.uploadUrl,
      expect.objectContaining({ method: "PUT", headers: INTENT.headers, body: file }),
    );
    expect(mockPost).toHaveBeenNthCalledWith(2, "/api/client/assets/As1/complete");
  });

  // 행사 테마의 로고·배경은 공간 자산이다 — 어느 공간인지 함께 보내야 그 공간의 게시 검사를 통과한다.
  it("공간 자산이면 workspaceId 를 의도에 싣는다", async () => {
    mockPost
      .mockResolvedValueOnce(ok(INTENT))
      .mockResolvedValueOnce(ok({ assetId: "As1", status: "VERIFIED", key: "uploads/w/a.png" }));
    const file = new File(["png"], "logo.png", { type: "image/png" });
    await uploadAsset({ file, purpose: "PAGE_THEME_ASSET", workspaceId: "Ws1" });
    expect(mockPost).toHaveBeenNthCalledWith(1, "/api/client/assets/upload-intents", {
      purpose: "PAGE_THEME_ASSET",
      contentType: "PNG",
      filename: "logo.png",
      fileSize: file.size,
      workspaceId: "Ws1",
    });
  });

  it("검증이 붐비면(ASSET-006) 잠시 뒤 완료 확인을 다시 부른다", async () => {
    jest.useFakeTimers();
    mockPost
      .mockResolvedValueOnce(ok(INTENT))
      .mockRejectedValueOnce(apiError("ASSET-006", 503))
      .mockResolvedValueOnce(ok({ assetId: "As1", status: "VERIFIED", key: "uploads/a.png" }));

    const pending = uploadAsset({
      file: new File(["png"], "a.png", { type: "image/png" }),
      purpose: "FRAME_ASSET",
    });
    await jest.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toMatchObject({ assetId: "As1" });
    expect(mockPost).toHaveBeenCalledTimes(3);
  });

  it("검증 실패(ASSET-003)는 다시 부르지 않고 그대로 던진다", async () => {
    mockPost.mockResolvedValueOnce(ok(INTENT)).mockRejectedValueOnce(apiError("ASSET-003", 422));

    await expect(
      uploadAsset({ file: new File(["png"], "a.png", { type: "image/png" }), purpose: "FRAME_ASSET" }),
    ).rejects.toMatchObject({ code: "ASSET-003" });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  // key 가 없으면 컴포넌트 source 를 채울 수 없다. 조용히 넘기면 blob 주소가 서버로 간다.
  it("완료 응답에 key 가 없으면 던진다", async () => {
    mockPost
      .mockResolvedValueOnce(ok(INTENT))
      .mockResolvedValueOnce(ok({ assetId: "As1", status: "VERIFIED" }));

    await expect(
      uploadAsset({ file: new File(["png"], "a.png", { type: "image/png" }), purpose: "FRAME_ASSET" }),
    ).rejects.toThrow("asset not verified");
  });

  it("10MB 를 넘으면 의도를 만들기 전에 막는다", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });

    await expect(uploadAsset({ file: big, purpose: "FRAME_ASSET" })).rejects.toBeInstanceOf(
      UploadValidationError,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("toAssetFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecode.mockResolvedValue({ source: {} as CanvasImageSource, width: 10, height: 20 });
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
    jest
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("용도가 받는 형식이면 그대로 둔다", async () => {
    const jpeg = new File(["jpg"], "photo.jpg", { type: "image/jpeg" });
    await expect(toAssetFile(jpeg, "FRAME_ASSET")).resolves.toBe(jpeg);
    expect(mockDecode).not.toHaveBeenCalled();
  });

  // 어느 용도도 WEBP 를 받지 않는다(415 GEN-051). 스티커는 대개 투명해서 PNG 로 굽는다.
  it.each([
    ["image/webp", "sticker.webp", "FRAME_ASSET"],
    ["image/gif", "moving.gif", "FRAME_ASSET"],
    ["image/jpeg", "text.jpg", "TEXT_RENDER"],
  ] as const)("%s 는 %s 용도에서 PNG 로 바꾼다", async (type, name, purpose) => {
    const converted = await toAssetFile(new File(["x"], name, { type }), purpose);
    expect(converted.type).toBe("image/png");
    expect(converted.name).toMatch(/\.png$/);
  });

  it("풀 수 없는 그림이면 지원하지 않는 형식이라고 던진다", async () => {
    mockDecode.mockResolvedValueOnce(null);
    await expect(
      toAssetFile(new File(["x"], "broken.webp", { type: "image/webp" }), "FRAME_ASSET"),
    ).rejects.toBeInstanceOf(UploadValidationError);
  });
});

describe("toAssetFile 용량", () => {
  afterEach(() => jest.restoreAllMocks());

  // Codex 리뷰(#527): PNG 로 바꾼 결과가 10MB 를 넘으면 같은 파일로는 영영 못 올렸다.
  it("PNG 로 바꾼 결과가 10MB 를 넘으면 줄여서 다시 굽는다", async () => {
    mockDecode.mockResolvedValue({ source: {} as CanvasImageSource, width: 4000, height: 3000 });
    const sizes: number[] = [];
    jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
      // 화소 수에 비례하는 가짜 크기 — 처음 굽기는 12MB 다.
      const bytes = Math.round((this.width * this.height) * 1);
      sizes.push(this.width);
      cb(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    });

    const file = await toAssetFile(new File(["x"], "big.webp", { type: "image/webp" }), "FRAME_ASSET");
    expect(file.size).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(sizes.length).toBeGreaterThan(1);
  });
});
