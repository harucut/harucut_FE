import {
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";

describe("user media preview helpers", () => {
  it("prefers displayName over original file name for the media title", () => {
    expect(
      getUserMediaTitle({
        mediaId: 1,
        s3Key: "uploads/photo.png",
        displayName: "harucut_20260416_213654",
        originalFileName: "photo.png",
      }),
    ).toBe("harucut_20260416_213654");
  });

  it("returns the download url as the preview url", () => {
    expect(
      getUserMediaPreviewUrl({
        mediaId: 1,
        s3Key: "uploads/photo.png",
        downloadUrl: "https://cdn.example.com/photo.png",
      }),
    ).toBe("https://cdn.example.com/photo.png");
  });

  it("returns null when the download url is missing or blank", () => {
    expect(
      getUserMediaPreviewUrl({
        mediaId: 2,
        s3Key: "uploads/photo.png",
      }),
    ).toBeNull();

    expect(
      getUserMediaPreviewUrl({
        mediaId: 3,
        s3Key: "uploads/photo.png",
        downloadUrl: "   ",
      }),
    ).toBeNull();
  });
});
