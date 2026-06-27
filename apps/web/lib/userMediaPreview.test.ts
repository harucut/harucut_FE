import { getUserMediaTitle } from "@/lib/userMediaPreview";

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
});
