import { toLocalInputValue, toServerDateTime } from "@/lib/studio/eventTime";

describe("행사 촬영 기간 변환", () => {
  it("입력값에 서울 offset 을 붙인다", () => {
    expect(toServerDateTime("2026-10-27T10:00")).toBe("2026-10-27T10:00:00+09:00");
  });

  // 비우면 즉시 시작·상시형이다. 빈 문자열을 그대로 보내면 서버가 시각으로 읽지 못한다.
  it.each(["", "2026-10-27", "abc"])("%s 는 null 이다", (value) => {
    expect(toServerDateTime(value)).toBeNull();
  });

  it("다른 offset 으로 온 값도 서울 시각으로 보여 준다", () => {
    expect(toLocalInputValue("2026-10-27T01:00:00Z")).toBe("2026-10-27T10:00");
    expect(toLocalInputValue("2026-10-27T10:00:00+09:00")).toBe("2026-10-27T10:00");
  });

  it("되돌리면 같은 값이다", () => {
    expect(toLocalInputValue(toServerDateTime("2026-12-31T23:30"))).toBe("2026-12-31T23:30");
  });

  it("없거나 읽을 수 없으면 빈 문자열이다", () => {
    expect(toLocalInputValue(null)).toBe("");
    expect(toLocalInputValue("not-a-date")).toBe("");
  });
});
