import { sanitizeEventName } from "./eventName";
test("행사명에서 제어·방향 문자를 제거하되 가족 이모지는 보존한다", () => {
  expect(sanitizeEventName("  민지·준호\u202e 결혼식\u0000 👩‍❤️‍👨  ")).toBe("민지·준호 결혼식 👩‍❤️‍👨");
});
test("한글과 이모지 모두 40글자 이내로 자르고 빈 값은 없앤다", () => {
  expect(sanitizeEventName("가".repeat(50))).toHaveLength(40);
  expect(sanitizeEventName("📸".repeat(41))).toBe("📸".repeat(40));
  expect(sanitizeEventName("\u202e\u0000 ")).toBeNull();
});
