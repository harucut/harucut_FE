const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import {
  PRESIGNED_UPLOAD_TYPES,
  UploadValidationError,
  isSupportedUploadFile,
  resolveUpload,
  resolveUploadContentType,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";

describe("presigned upload flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("maps jpg files to the swagger JPEG enum", () => {
    const jpg = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    expect(resolveUploadContentType(jpg)).toBe("JPEG");
  });

  it("keeps the original filename when its extension is already supported", () => {
    const jpg = new File(["x"], "photo.JPG", { type: "image/jpeg" });
    expect(resolveUpload(jpg)).toEqual({ contentType: "JPEG", filename: "photo.jpg" });
  });

  // 서버는 filename 확장자와 contentType이 같은 enum 항목에 동시에 속해야만 presign을 내준다.
  // 확장자가 지원 목록 밖이면(.jfif 등) 파일명을 형식에 맞춰 고쳐 보내야 415가 안 난다.
  it("normalizes the filename when only the MIME type is supported", () => {
    const jfif = new File(["x"], "windows-download.jfif", { type: "image/jpeg" });
    expect(resolveUpload(jfif)).toEqual({
      contentType: "JPEG",
      filename: "windows-download.jpg",
    });
  });

  // 파일명은 호출부가 지어내기도 해서(확장자를 .jpg로 고정하는 식) 바이트와 어긋날 수 있다.
  // 형식 판정은 MIME이 이겨야 PNG를 image/jpeg로 올리는 사고가 안 난다.
  it("prefers the MIME type over a mismatched filename extension", () => {
    const png = new File(["x"], "theme-photo-1700000000000.jpg", {
      type: "image/png",
    });

    expect(resolveUpload(png)).toEqual({
      contentType: "PNG",
      filename: "theme-photo-1700000000000.png",
    });
  });

  it("rejects unsupported formats with a Korean message", () => {
    const heic = new File(["x"], "iphone.heic", { type: "image/heic" });

    expect(() => resolveUploadContentType(heic)).toThrow(
      /PNG·JPG·WEBP·GIF만 올릴 수 있어요/,
    );
    expect(isSupportedUploadFile(heic)).toBe(false);
    expect(
      isSupportedUploadFile(new File(["x"], "ok.webp", { type: "image/webp" })),
    ).toBe(true);
  });

  it("uses the presigned-img URL string after image upload", async () => {
    const key = "temp/users/u/components/test-image.png";
    // 실제 계약은 Response<String> — data가 URL 문자열 그 자체다(객체 아님).
    const downloadUrl = "https://example.com/test-image.png?sig=2";

    mockPost.mockResolvedValueOnce({
      data: {
        code: "GEN-000",
        status: 200,
        message: null,
        data: {
          key,
          uploadUrl: "https://example.com/upload/test-image.png?sig=1",
          contentType: "image/png",
          expiresIn: "PT24H",
        },
      },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    mockGet.mockResolvedValueOnce({
      data: {
        code: "GEN-000",
        status: 200,
        message: null,
        data: downloadUrl,
      },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await uploadToS3WithPresigned({
      file: new File(["x"], "test-image.png", { type: "image/png" }),
      type: PRESIGNED_UPLOAD_TYPES.FRAME_COMPONENT,
    });

    expect(mockGet).toHaveBeenCalledWith(
      `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
    );
    expect(result).toEqual({
      key,
      objectUrl: "https://example.com/test-image.png?sig=2",
      downloadUrl: "https://example.com/test-image.png?sig=2",
    });
  });

  it("sends the presigned content type as the S3 PUT header", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        code: "GEN-000",
        status: 200,
        message: null,
        data: {
          key: "uploads/users/u/photo.png",
          uploadUrl: "https://example.com/upload/photo.png?sig=1",
          contentType: "image/png",
          expiresIn: "PT24H",
        },
      },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    mockGet.mockResolvedValueOnce({
      data: { code: "GEN-000", status: 200, message: null, data: "https://example.com/photo.png?sig=2" },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadToS3WithPresigned({
      file: new File(["x"], "photo.png", { type: "image/png" }),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_SOURCE,
    });

    // 서명에 content-type이 포함돼 있어(X-Amz-SignedHeaders=content-type;host)
    // 헤더가 빠지거나 다르면 S3가 403 SignatureDoesNotMatch로 거절한다.
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/upload/photo.png?sig=1",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/png" },
      }),
    );

    // presign 요청 바디는 네 필드 전부 required 다. fileSize 가 빠지면 400 GEN-003.
    expect(mockPost).toHaveBeenCalledWith("/api/client/user/files/presigned-upload", {
      type: "FOURCUT_SOURCE",
      filename: "photo.png",
      contentType: "PNG",
      fileSize: 1,
    });
  });

  /*
    fileSize 는 위아래가 다 막혀 있다 — `@Positive @Max(10485760)` 이라 0 은 400 GEN-003 이다
    (실측: `{"field":"fileSize","message":"파일 크기는 0보다 커야 합니다."}`).
    스웨거 JSON 의 `minimum: 0` 만 보고 하한이 없다고 읽으면 안 된다.

    걸러내지 않으면 발급 요청이 한 번 나갔다가 400 으로 돌아오고, 화면은 우리가 준비한
    한국어 문구 대신 에러 코드 매핑 결과를 띄운다. `UploadValidationError` 로 던져야
    마이페이지가 "우리가 걸러낸 것"으로 알아보고 그 문구를 그대로 보여 준다.
  */
  it("0바이트 파일은 발급 요청 자체를 하지 않는다", async () => {
    const empty = new File([], "empty.png", { type: "image/png" });
    expect(empty.size).toBe(0);

    await expect(
      uploadToS3WithPresigned({
        file: empty,
        type: PRESIGNED_UPLOAD_TYPES.PROFILE,
      }),
    ).rejects.toThrow(UploadValidationError);

    expect(mockPost).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 하한을 한 칸 어긋나게 잡으면 1바이트가 막힌다. 서버가 받아 주는 최솟값은 통과해야 한다.
  it("1바이트 파일은 그대로 발급 요청한다", async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        code: "GEN-000",
        status: 200,
        message: null,
        data: {
          key: "uploads/users/u/profile/one-byte.png",
          uploadUrl: "https://example.com/upload/one-byte.png?sig=1",
          contentType: "image/png",
          expiresIn: "PT24H",
        },
      },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });

    await uploadToS3WithPresigned({
      file: new File(["x"], "one-byte.png", { type: "image/png" }),
      type: PRESIGNED_UPLOAD_TYPES.PROFILE,
      skipUrlResolve: true,
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/client/user/files/presigned-upload",
      expect.objectContaining({ fileSize: 1 }),
    );
  });
});
