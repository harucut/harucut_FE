import {
  PRESIGNED_UPLOAD_TYPES,
  resolveFourcutUploadType,
} from "@/lib/presignedUploadApi";

describe("resolveFourcutUploadType", () => {
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
});
