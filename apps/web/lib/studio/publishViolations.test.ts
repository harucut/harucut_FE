import { groupViolations } from "@/lib/studio/publishViolations";

describe("게시 위반 묶기", () => {
  it("첨자 붙은 field 를 설정 묶음으로 모으고 화면 순서대로 둔다", () => {
    const groups = groupViolations([
      { field: "consentItems", reason: "필수 동의 항목이 하나 이상 있어야 한다" },
      { field: "frames[0]", reason: "없는 프레임 발행본이다" },
      { field: "frames[1]", reason: "없는 프레임 발행본이다" },
      { field: "byodEnabled", reason: "개인 휴대폰·부스 중 하나 이상을 허용해야 한다" },
    ]);

    expect(groups.map((g) => g.key)).toEqual(["byodEnabled", "frames", "consentItems"]);
    // 같은 사유는 한 번만 보여 준다.
    expect(groups[1].reasons).toEqual(["없는 프레임 발행본이다"]);
  });

  it("모르는 field 는 일반 문구로 맨 뒤에 둔다", () => {
    const groups = groupViolations([
      { field: "somethingNew", reason: "x" },
      { field: "allowedLayouts", reason: "y" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["allowedLayouts", "somethingNew"]);
    expect(groups[1].message).toBe("설정을 다시 확인해 주세요.");
  });

  it("테마 위반(theme.colors.bg 등)은 행사 화면 꾸미기 하나로 묶는다", () => {
    const groups = groupViolations([
      { field: "theme.colors.bg", reason: "#RRGGBB 형식이어야 한다" },
      { field: "theme.branding.hideHarucutBranding", reason: "이용권 기능 WHITE_LABEL 이 있어야 숨길 수 있다" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].message).toMatch(/^행사 화면 꾸미기를 확인해 주세요/);
    expect(groups[0].reasons).toHaveLength(2);
  });
});
