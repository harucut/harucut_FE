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
  resolveFourcutUploadType,
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

  it("maps shot videos to FOURCUT_VIDEO and photos to FOURCUT_PHOTO", () => {
    const capturedVideo = new File(["x"], "captured.webm", {
      type: "video/webm",
    });
    const capturedPhoto = new File(["x"], "captured.png", {
      type: "image/png",
    });

    expect(resolveFourcutUploadType(capturedVideo)).toBe(
      PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO,
    );
    expect(resolveFourcutUploadType(capturedPhoto)).toBe(
      PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO,
    );
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

  it("transcodes webm output and returns the converted downloadUrl", async () => {
    const key = "uploads/users/u/video.webm";
    const downloadUrl =
      "https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/u/video.mp4?sig=2";

    mockPost
      .mockResolvedValueOnce({
        data: {
          code: "GEN-000",
          status: 200,
          message: null,
          data: {
            key,
            uploadUrl: "https://example.com/upload/video.webm?sig=1",
            contentType: "video/webm",
            expiresIn: "PT24H",
          },
        },
        ok: true,
        status: 200,
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        data: {
          code: "GEN-000",
          status: 200,
          message: null,
          data: {
            mediaId: 8,
            mediaType: "VIDEO",
            s3Key: "uploads/users/u/video.mp4",
            downloadUrl,
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
          downloadUrl: "https://example.com/video.webm?sig=3",
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

    const result = await uploadFourcutMedia(
      new File(["x"], "video.webm", { type: "video/webm" }),
    );

    expect(mockPost).toHaveBeenNthCalledWith(2, "/api/client/user/files/transcode", {
      filename: "video.webm",
    });
    expect(result).toEqual({
      key,
      mediaId: 8,
      objectUrl: downloadUrl,
      downloadUrl,
    });
  });
});
