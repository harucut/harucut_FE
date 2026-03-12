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

  it("requests presigned image url after image upload", async () => {
    const key = "temp/users/u/components/test-image.png";

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
          url: "https://example.com/view/test-image.png?sig=2",
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
      objectUrl: "https://example.com/view/test-image.png?sig=2",
    });
  });

  it("requests transcode after webm upload", async () => {
    const key =
      "temp/users/u/fourcut/550e8400-e29b-41d4-a716-446655440000.webm";

    mockPost
      .mockResolvedValueOnce({
        data: {
          code: "GEN-000",
          status: 200,
          message: null,
          data: {
            key,
            uploadUrl:
              "https://example.com/upload/550e8400-e29b-41d4-a716-446655440000.webm?sig=1",
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

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await uploadToS3WithPresigned({
      file: new File(["x"], "550e8400-e29b-41d4-a716-446655440000.webm", {
        type: "video/webm",
      }),
      type: PRESIGNED_UPLOAD_TYPES.FOURCUT_VIDEO,
      isTemp: false,
    });

    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      "/api/client/user/files/transcode",
      {
        filename: "550e8400-e29b-41d4-a716-446655440000.webm",
      },
    );
    expect(result).toEqual({
      key,
      objectUrl:
        "https://example.com/upload/550e8400-e29b-41d4-a716-446655440000.webm",
    });
  });
});
