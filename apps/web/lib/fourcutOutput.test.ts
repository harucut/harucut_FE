/**
 * 결과물 파일명 규칙을 지킨다.
 *
 * 핵심은 **길이 상한**이다. 서버는 `displayName` 을 255자까지만 받고(로컬 /v3/api-docs 의
 * `DisplayNameUpdateRequest`), 넘기면 400 이 온다. 사유가 영문이라 화면 안내는
 * 「잠시 후 다시 시도해 주세요」로 뭉개져서, 사용자는 기다리면 풀릴 실패로 오해한다.
 *
 * 입력창의 maxLength 만으로는 못 막는다 — 비회원 인계 보관물의 이름은 저장소에서 그대로
 * 읽혀 화면을 거치지 않고 서버로 간다(lib/pendingGuestSave.ts → GuestTrialBridge).
 */
import {
  buildDefaultDisplayName,
  buildDownloadFilename,
  DISPLAY_NAME_MAX_LENGTH,
  sanitizeDisplayName,
} from "@/lib/fourcutOutput";

describe("sanitizeDisplayName", () => {
  it("앞뒤 공백을 걷어내고 파일명에 못 쓰는 글자를 바꾼다", () => {
    expect(sanitizeDisplayName("  바다 : 여행/기록  ", "harucut")).toBe(
      "바다 - 여행-기록",
    );
  });

  it("연속 공백을 하나로 줄이고 끝의 점을 없앤다", () => {
    expect(sanitizeDisplayName("여름   바다...", "harucut")).toBe("여름 바다");
  });

  it("다듬고 나면 빈 이름은 폴백으로 돌아간다", () => {
    expect(sanitizeDisplayName("   ...  ", "harucut")).toBe("harucut");
  });

  it("상한 안의 이름은 손대지 않는다", () => {
    const name = "가".repeat(DISPLAY_NAME_MAX_LENGTH);

    expect(sanitizeDisplayName(name, "harucut")).toBe(name);
  });

  it("상한을 넘으면 자른다 — 화면을 거치지 않는 입구가 있어서다", () => {
    const result = sanitizeDisplayName("나".repeat(400), "harucut");

    expect(result).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
  });

  it("잘린 끝에 공백이나 점을 남기지 않는다", () => {
    // 상한 자리가 공백·점이 되도록 맞춘다. 그대로 두면 이름이 "... 여름 " 처럼 끝난다.
    const head = "가".repeat(DISPLAY_NAME_MAX_LENGTH - 1);
    const withSpace = sanitizeDisplayName(`${head} 여름`, "harucut");
    const withDot = sanitizeDisplayName(`${head}.여름`, "harucut");

    expect(withSpace).toBe(head);
    expect(withDot).toBe(head);
  });

  it("이모지 한 글자를 반으로 가르지 않는다", () => {
    // 이모지는 UTF-16 두 칸을 쓴다. 상한 자리에서 앞 칸만 남으면 깨진 글자가 된다.
    const head = "가".repeat(DISPLAY_NAME_MAX_LENGTH - 1);
    const result = sanitizeDisplayName(`${head}\u{1f4f7}!`, "harucut");

    expect(result).toBe(head);
    expect(result).not.toMatch(/[\ud800-\udbff]$/);
  });

  it("폴백에도 같은 상한을 건다 — 폴백도 그대로 서버로 나간다", () => {
    const result = sanitizeDisplayName("", "다".repeat(400));

    expect(result).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
  });
});

describe("buildDefaultDisplayName", () => {
  it("생성 시각만으로 이름을 짓는다", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 7, 4, 5, 6));

    try {
      expect(buildDefaultDisplayName()).toBe("harucut_20260907_040506");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("buildDownloadFilename", () => {
  it("확장자를 붙인다", () => {
    expect(buildDownloadFilename("여름 바다", "png")).toBe("여름 바다.png");
  });

  it("이미 같은 확장자로 끝나면 덧붙이지 않는다", () => {
    expect(buildDownloadFilename("여름 바다.PNG", ".png")).toBe("여름 바다.PNG");
  });

  it("이름이 비면 harucut 으로 내려받는다", () => {
    expect(buildDownloadFilename("   ", "png")).toBe("harucut.png");
  });
});
