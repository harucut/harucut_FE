import {
  getUserMediaDateLabel,
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";

const NOW = new Date("2026-08-15T12:00:00+09:00");

describe("user media preview helpers", () => {
  it("uses the user's own name for the media title", () => {
    expect(
      getUserMediaTitle(
        {
          mediaId: 1,
          s3Key: "uploads/photo.png",
          displayName: "제주도 마지막 날",
          createdAt: "2026-08-15T09:12:00+09:00",
        },
        NOW,
      ),
    ).toBe("제주도 마지막 날");
  });

  // 서버 기본 이름·메신저 파일명·UUID 는 제목이 되면 안 된다. 넉 장이 나란히 있어도
  // 서로 구분이 안 되고, 그날 무엇을 찍었는지도 알려주지 않는다.
  it.each([
    ["harucut_20260416_213654", "서버 기본 이름"],
    ["KakaoTalk_20260101_193355_1.jpg", "메신저 파일명"],
    ["3f9a1c2e-7b41-4c0a-9d55-1a2b3c4d5e6f", "UUID"],
    ["IMG_1234.HEIC", "카메라 파일명"],
  ])("falls back to the date when the name is machine-made (%s)", (name) => {
    expect(
      getUserMediaTitle(
        {
          mediaId: 1,
          s3Key: "uploads/photo.png",
          displayName: name,
          createdAt: "2026-08-15T09:12:00+09:00",
        },
        NOW,
      ),
    ).toBe("8월 15일의 네 컷");
  });

  it("keeps the year when the record is from another year", () => {
    expect(
      getUserMediaDateLabel(
        {
          mediaId: 1,
          s3Key: "uploads/photo.png",
          createdAt: "2025-12-31T09:12:00+09:00",
        },
        NOW,
      ),
    ).toBe("2025년 12월 31일");
  });

  it("returns null for the date label when the server sent no date", () => {
    expect(
      getUserMediaDateLabel({ mediaId: 1, s3Key: "uploads/photo.png" }, NOW),
    ).toBeNull();
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
