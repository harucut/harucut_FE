import { hasFinalConsonant, josa, withJosa } from "@harucut/shared";

describe("josa", () => {
  // 받침 유무로 조사가 갈린다. 화면에 `을(를)` 처럼 둘 다 적어 두지 않으려고 만든 것이다.
  it.each([
    ["연락처", "를"],
    ["행사 이름", "을"],
    ["단체·회사 이름", "을"],
    ["일시", "를"],
  ])("picks 을/를 for %s", (word, expected) => {
    expect(josa(word, "을/를")).toBe(expected);
  });

  it.each([
    ["프레임", "이"],
    ["사진", "이"],
    ["기록", "이"],
    ["하루컷", "이"],
    ["카메라", "가"],
  ])("picks 이/가 for %s", (word, expected) => {
    expect(josa(word, "이/가")).toBe(expected);
  });

  // ㄹ 받침은 "으로"가 아니라 "로"다.
  it("uses 로 after a ㄹ final consonant", () => {
    expect(josa("서울", "으로/로")).toBe("로");
    expect(josa("QR", "으로/로")).toBe("로");
    expect(josa("사진", "으로/로")).toBe("으로");
  });

  // 한글이 아닌 글자로 끝나면 받침을 알 수 없으므로 받침 없는 쪽을 쓴다.
  it("falls back to the no-final form for non-Hangul endings", () => {
    expect(hasFinalConsonant("QR")).toBe(false);
    expect(josa("QR", "을/를")).toBe("를");
    expect(josa("2026", "이/가")).toBe("가");
  });

  it("joins the word and the particle", () => {
    expect(withJosa("연락처", "을/를")).toBe("연락처를");
    expect(withJosa("행사 이름", "을/를")).toBe("행사 이름을");
  });
});
