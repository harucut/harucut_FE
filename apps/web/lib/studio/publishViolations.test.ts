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
    // 같은 사유는 한 번만, 운영자가 읽는 말로 보여 준다.
    expect(groups[1].reasons).toEqual(["지금은 없는 프레임이 들어 있어요. 빼고 다시 골라 주세요."]);
  });

  // 상시 캠페인에 종료 시각이 남으면 captureEndsAt 위반(ADR-0009 §4). 화면에서 촬영 기간이 참가 방식보다 위다.
  it("상시 캠페인의 종료 시각 위반은 촬영 기간 문구로 맨 앞에 둔다", () => {
    const groups = groupViolations([
      { field: "byodEnabled", reason: "개인 휴대폰·부스 중 하나 이상을 허용해야 한다" },
      { field: "captureEndsAt", reason: "상시 캠페인은 종료 시각을 두지 않는다" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["captureEndsAt", "byodEnabled"]);
    expect(groups[0].message).toContain("상시 캠페인은 종료 시각을 비워야 해요");
  });

  it("모르는 field 는 일반 문구로 맨 뒤에 둔다", () => {
    const groups = groupViolations([
      { field: "somethingNew", reason: "x" },
      { field: "allowedLayouts", reason: "y" },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["allowedLayouts", "somethingNew"]);
    expect(groups[1].message).toBe("설정을 다시 확인해 주세요.");
  });

  it("서버 사유의 필드 이름과 내부 용어를 화면에 내보내지 않는다", () => {
    const groups = groupViolations([
      { field: "theme.branding.outputLogo", reason: "완성 이미지에 넣을 로고(theme.logoAssetId)가 없다" },
      { field: "frames", reason: "제공 프레임이 하나 이상 있어야 한다 — 기본 카탈로그로 대체하지 않는다" },
      { field: "allowedLayouts", reason: "CLASSIC 에 연결된 프레임이 없다" },
      { field: "theme.schemaVersion", reason: "unknownInternalField 가 이상하다" },
    ]);
    const text = groups.flatMap((g) => [g.message, ...g.reasons]).join(" ");
    expect(text).not.toMatch(/logoAssetId|카탈로그|CLASSIC|unknownInternalField/);
    expect(groups.find((g) => g.key === "theme")?.reasons).toEqual(["완성 사진에 넣을 로고를 올려 주세요."]);
    expect(groups.find((g) => g.key === "allowedLayouts")?.reasons[0]).toMatch(/에 연결된 프레임이 없어요\.$/);
  });

  it("묶음마다 고치러 갈 구역을 알려 준다", () => {
    const groups = groupViolations([
      { field: "consentItems", reason: "필수 동의 항목이 하나 이상 있어야 한다" },
      { field: "frames[0]", reason: "없는 프레임 발행본이다" },
      { field: "theme", reason: "이용권 기능 CUSTOM_THEME 이 있어야 색·글꼴·로고·배경을 바꿀 수 있다" },
      { field: "somethingNew", reason: "모르는 사유" },
    ]);
    expect(groups.map((g) => g.anchor)).toEqual(["frames", "consent", "design", undefined]);
    expect(groups[3].reasons).toEqual(["모르는 사유"]);
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
