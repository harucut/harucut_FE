/**
 * 공유 링크 주소와 공유하는 사진의 이름(2026-11-16). 이름은 기록 목록과 같은 규칙이고, 받는 사람 페이지는 서버가 그려도
 * 한국 시간으로 날짜를 읽는다.
 */
import { isShareToken, mediaShareUrl, sharedPhotoTitle } from "@/lib/mediaShareLink";

const NOW = new Date("2026-11-16T03:00:00Z");

describe("사진 이름", () => {
  it("사람이 붙인 이름은 그대로 쓴다 — 서버가 붙인 확장자만 뗀다", () => {
    expect(sharedPhotoTitle("우리 넷.jpg", "2026-11-15T14:30:00", NOW)).toBe("우리 넷");
  });

  it("기계가 붙인 이름은 날짜로 부른다 — 오프셋 없는 시각은 한국 시간이다", () => {
    expect(sharedPhotoTitle("harucut_20261115_233000", "2026-11-15T23:30:00", NOW)).toBe("11월 15일의 네 컷");
  });

  it("백엔드 기본 이름과 소수 초가 붙은 시각도 읽는다", () => {
    // 백엔드는 기본 이름 harucut_yyyyMMdd_HHmmss.jpg, 시각은 소수 초가 붙은 KST 다(feat/media-share-link).
    expect(sharedPhotoTitle("harucut_20261112_004151.jpg", "2026-11-12T00:41:51.065454", NOW)).toBe("11월 12일의 네 컷");
  });

  it("UTC 로 온 시각도 한국 날짜로 읽는다 — 서버 시간대에 기대지 않는다", () => {
    // 15일 15:30Z 는 한국 16일 00:30 이다.
    expect(sharedPhotoTitle("harucut_20261116_003000", "2026-11-15T15:30:00Z", NOW)).toBe("11월 16일의 네 컷");
  });

  it("올해가 아니면 해를 붙이고, 날짜도 없으면 「하루컷 네 컷」", () => {
    expect(sharedPhotoTitle("", "2025-08-15T10:00:00", NOW)).toBe("2025년 8월 15일의 네 컷");
    expect(sharedPhotoTitle("IMG_1234.jpg", null, NOW)).toBe("하루컷 네 컷");
  });
});

describe("링크", () => {
  it("받는 사람 주소는 /s/<토큰> 이다", () => {
    expect(mediaShareUrl("https://www.harucut.com/", "tok_0123456789abcdef")).toBe("https://www.harucut.com/s/tok_0123456789abcdef");
  });

  it("토큰 모양 — URL 에 그대로 실을 수 있는 16자 이상", () => {
    expect(isShareToken("tok_0123456789abcdef")).toBe(true);
    // 백엔드가 주는 모양: 32바이트 base64url 43자
    expect(isShareToken("Q2hhbmdlTWUtVGhpc0lzQVRlc3RUb2tlbi0xMjM0NTY")).toBe(true);
    expect(isShareToken("tok-0123456789ABCDEF_x")).toBe(true);
    expect(isShareToken("short")).toBe(false);
    expect(isShareToken("tok/0123456789abcdef")).toBe(false);
  });
});
