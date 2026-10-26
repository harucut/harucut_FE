import { settingsPatch, themePatch } from "@/lib/studio/settingsPatch";

const BASE = {
  name: "결혼식",
  byodEnabled: true,
  boothEnabled: false,
  resultRetentionDays: 30,
  allowedLayouts: ["CLASSIC" as const],
  theme: { schemaVersion: 1 as const, colors: { bg: "#FFF8F3", accent: "#C8553D" }, copy: { welcome: "어서 오세요" } },
};

it("바뀐 최상위 필드만 보낸다 — 상속받은 값은 다시 보내지 않는다", () => {
  expect(settingsPatch({ ...BASE, name: "새 이름" }, BASE, { sources: {} })).toEqual({ name: "새 이름" });
});

it("「기본값 따르기」를 고른 필드는 null 로 보낸다", () => {
  expect(settingsPatch(BASE, BASE, { sources: {}, inherit: new Set(["resultRetentionDays", "theme"]) })).toEqual({
    resultRetentionDays: null,
    theme: null,
  });
});

it("테마는 행사가 직접 정한 키와 바꾼 키만 담는다", () => {
  const sources = { "theme.colors.bg": "PROJECT", "theme.colors.accent": "EVENT", "theme.copy.welcome": "WORKSPACE" } as const;
  const next = { ...BASE.theme, copy: { welcome: "환영해요" } };
  expect(themePatch(next, BASE.theme, sources)).toEqual({
    schemaVersion: 1,
    colors: { accent: "#C8553D" },
    copy: { welcome: "환영해요" },
  });
});

it("테마가 그대로면 보내지 않고, 출처를 모르면 지금 테마 전체를 보낸다", () => {
  expect(themePatch(BASE.theme, BASE.theme, {})).toBeUndefined();
  const next = { ...BASE.theme, font: "GOWUN_DODUM" as const };
  expect(themePatch(next, BASE.theme, null)).toEqual(next);
});

it("직접 정한 키를 모두 지우면 테마 전체를 상속(null)으로 보낸다", () => {
  const sources = { "theme.colors.bg": "EVENT" } as const;
  expect(themePatch({ schemaVersion: 1 }, { schemaVersion: 1, colors: { bg: "#000000" } }, sources)).toBeNull();
});
