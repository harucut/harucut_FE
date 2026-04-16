import { getUserMediaPreview, getUserMediaTitle } from "@/lib/userMediaPreview";

describe("user media preview helpers", () => {
  it("prefers displayName over original file name for the media title", () => {
    expect(
      getUserMediaTitle({
        mediaId: 1,
        mediaType: "PHOTO",
        s3Key: "uploads/photo.png",
        displayName: "harucut_20260416_213654",
        originalFileName: "photo.png",
      }),
    ).toBe("harucut_20260416_213654");
  });

  it("uses the same-name photo as the preview image for a video item", () => {
    const items = [
      {
        mediaId: 10,
        mediaType: "VIDEO" as const,
        s3Key: "uploads/result.mp4",
        displayName: "harucut_20260416_213654.mp4",
        downloadUrl: null,
      },
      {
        mediaId: 11,
        mediaType: "PHOTO" as const,
        s3Key: "uploads/result.png",
        displayName: "harucut_20260416_213654.png",
        downloadUrl: "https://example.com/result.png",
      },
    ];

    expect(getUserMediaPreview(items[0], items)).toEqual({
      kind: "image",
      url: "https://example.com/result.png",
    });
  });

  it("falls back to the video file when no same-name photo exists", () => {
    const item = {
      mediaId: 10,
      mediaType: "VIDEO" as const,
      s3Key: "uploads/result.mp4",
      displayName: "harucut_20260416_213654",
      downloadUrl: "https://example.com/result.mp4",
    };

    expect(getUserMediaPreview(item, [item])).toEqual({
      kind: "video",
      url: "https://example.com/result.mp4",
    });
  });
});
