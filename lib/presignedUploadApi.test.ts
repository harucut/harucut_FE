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
  resolveFourcutUploadType,
  uploadToS3WithPresigned,
} from "@/lib/presignedUploadApi";

describe("presigned upload flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("maps shot and uploaded videos to FOURCUT_VIDEO", () => {
    const capturedVideo = new File(["x"], "captured.webm", {
      type: "video/webm",
    });
    const uploadedVideo = new File(["x"], "uploaded.webm", {
      type: "video/webm",
    });

    expect(resolveFourcutUploadType(capturedVideo)).toBe(
      PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO,
    );
    expect(resolveFourcutUploadType(uploadedVideo)).toBe(
      PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO,
    );
  });

  it("maps shot and uploaded photos to FOURCUT_PHOTO", () => {
    const capturedPhoto = new File(["x"], "captured.png", {
      type: "image/png",
    });
    const uploadedPhoto = new File(["x"], "uploaded.jpeg", {
      type: "image/jpeg",
    });

    expect(resolveFourcutUploadType(capturedPhoto)).toBe(
      PRESIGNED_UPLOAD_TYPES.FOURCUT_PHOTO,
    );
    expect(resolveFourcutUploadType(uploadedPhoto)).toBe(
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

  it("transcodes webm and returns mp4 downloadUrl", async () => {
    const key =
      "uploads/users/VZ_LtszNul/webm/d62ce849-47f7-4983-bbbf-0f4f2fcb6029.webm";
    const downloadUrl =
      "[https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/VZ_LtszNul/mp4/d62ce849-47f7-4983-bbbf-0f4f2fcb6029_converted.mp4](https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/VZ_LtszNul/mp4/d62ce849-47f7-4983-bbbf-0f4f2fcb6029_converted.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256)";

    mockPost
      .mockResolvedValueOnce({
        data: {
          code: "GEN-000",
          status: 200,
          message: null,
          data: {
            key,
            uploadUrl:
              "https://example.com/upload/d62ce849-47f7-4983-bbbf-0f4f2fcb6029.webm?sig=1",
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
          data: {},
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
          mediaType: "VIDEO",
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
      file: new File(["x"], "d62ce849-47f7-4983-bbbf-0f4f2fcb6029.webm", {
        type: "video/webm",
      }),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO,
      isTemp: false,
    });

    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      "/api/client/user/files/transcode",
      {
        filename: "d62ce849-47f7-4983-bbbf-0f4f2fcb6029.webm",
      },
    );
    expect(mockGet).toHaveBeenCalledWith(
      `/api/client/user/files/presigned-img?key=${encodeURIComponent(key)}`,
    );
    expect(result).toEqual({
      key,
      objectUrl:
        "https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/VZ_LtszNul/mp4/d62ce849-47f7-4983-bbbf-0f4f2fcb6029_converted.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      downloadUrl:
        "https://harucuts3.s3.ap-northeast-2.amazonaws.com/uploads/users/VZ_LtszNul/mp4/d62ce849-47f7-4983-bbbf-0f4f2fcb6029_converted.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256",
    });
  });
});
