const mockGet = jest.fn();
const mockPost = jest.fn();
const mockRegisterUserMedia = jest.fn();

jest.mock("@/lib/clientApi", () => ({
  clientApi: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

jest.mock("@/lib/userMediaApi", () => ({
  registerUserMedia: (...args: unknown[]) => mockRegisterUserMedia(...args),
}));

import {
  PRESIGNED_UPLOAD_TYPES,
  isSupportedUploadFile,
  resolveUploadContentType,
  uploadFourcutMedia,
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

  it("uses downloadUrl from presigned-img response after image upload", async () => {
    const key = "temp/users/u/components/test-image.png";
    const downloadUrl =
      "[https://example.com/test-image.png](https://example.com/test-image.png?sig=2)";

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
        data: {
          downloadUrl,
        },
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
      isTemp: true,
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

  it("registers photo media after upload", async () => {
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
      data: {
        code: "GEN-000",
        status: 200,
        message: null,
        data: {
          downloadUrl: "https://example.com/photo.png?sig=2",
        },
      },
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    mockRegisterUserMedia.mockResolvedValueOnce({
      mediaId: 1,
      mediaType: "PHOTO",
      s3Key: "uploads/users/u/photo.png",
      downloadUrl: "https://example.com/photo.png?sig=3",
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await uploadFourcutMedia(
      new File(["x"], "photo.png", { type: "image/png" }),
    );

    expect(mockRegisterUserMedia).toHaveBeenCalledWith({
      mediaType: "PHOTO",
      s3Key: "uploads/users/u/photo.png",
    });
    expect(result.downloadUrl).toBe("https://example.com/photo.png?sig=3");
  });
});
