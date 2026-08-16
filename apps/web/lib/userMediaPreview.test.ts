import {
  getUserMediaDateLabel,
  getUserMediaPreviewUrl,
  getUserMediaTitle,
} from "@/lib/userMediaPreview";

const NOW = new Date("2026-08-15T12:00:00+09:00");

describe("user media preview helpers", () => {
  // 서버는 저장할 때 이름 뒤에 확장자를 붙여 돌려준다(실측: "연결점검" -> "연결점검.png").
  // 확장자만 보고 기계 이름으로 판정하면 사용자가 지은 이름이 전부 날짜로 갈아치워져,
  // 기록 화면에서 이름을 바꿔도 목록 제목이 안 바뀌는 것처럼 보인다.
  it.each(["졸업식.jpg", "연결점검.png", "제주도 마지막 날.webp"])(
    "keeps a user-written name even when the server appended an extension (%s)",
    (name) => {
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
      ).toBe(name.replace(/\.[a-z]+$/i, ""));
    },
  );

  // 접두사가 같아도 뒤에 숫자가 없으면 사람이 지은 이름이다.
  it("keeps names that only look like camera files", () => {
    expect(
      getUserMediaTitle(
        {
          mediaId: 1,
          s3Key: "uploads/photo.png",
          displayName: "IMG_우리집",
          createdAt: "2026-08-15T09:12:00+09:00",
        },
        NOW,
      ),
    ).toBe("IMG_우리집");
  });

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

  // 서버는 오프셋 없는 UTC 를 준다. 로컬 시각으로 읽으면 한국에서 하루가 어긋난다.
  it("reads the server's offset-less timestamp as UTC", () => {
    expect(
      getUserMediaDateLabel(
        {
          mediaId: 1,
          s3Key: "uploads/photo.png",
          // UTC 8/14 18:00 = KST 8/15 03:00
          createdAt: "2026-08-14T18:00:00",
        },
        NOW,
      ),
    ).toBe("8월 15일");
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
