import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PAGE_THEME_COLORS,
  contrastRatio,
  lowContrastPairs,
  pageThemeCopy,
  pageThemeStyle,
  safeAssetUrl,
} from "@/lib/event/pageTheme";

it("형식이 맞는 색만 --ev-* 토큰으로 덮는다", () => {
  const style = pageThemeStyle({ colors: { bg: "#FFF8F3", accent: "red", text: "#12345", card: "#ffffff" } }) as Record<string, string>;
  expect(style).toEqual({ "--ev-bg": "#FFF8F3", "--ev-card": "#ffffff" });
});

it("배경 이미지는 http(s) URL 만 쓰고, 따옴표가 든 주소도 CSS 밖으로 새지 않는다", () => {
  expect(pageThemeStyle({ backgroundUrl: "javascript:alert(1)" })).toEqual({});
  const style = pageThemeStyle({ backgroundUrl: 'https://s3.example.com/bg.png?x="); color: red' }) as Record<string, string>;
  expect(style.backgroundImage).toBe('url("https://s3.example.com/bg.png?x=%22);%20color:%20red")');
  expect(safeAssetUrl("not a url")).toBeNull();
});

it("주최자 문구가 비었으면 기본 문구, 길면 200자에서 자른다", () => {
  expect(pageThemeCopy({ copy: { welcome: "  " } }, "welcome", "기본")).toBe("기본");
  expect(pageThemeCopy({ copy: { welcome: " 어서 오세요 " } }, "welcome", "기본")).toBe("어서 오세요");
  expect(pageThemeCopy({ copy: { done: "가".repeat(250) } }, "done", "")).toHaveLength(200);
  expect(pageThemeCopy(null, "done", "기본")).toBe("기본");
});

it("대비율을 계산하고 모자란 짝만 알린다", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21);
  expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1);
  expect(lowContrastPairs({})).toEqual([]);
  expect(lowContrastPairs({ accent: "#FFE066" }).map((p) => p.label)).toEqual(["버튼 글자 / 버튼"]);
});

// 서버도 같은 기본값을 채워 내려준다(백엔드 ThemeResolver.DEFAULT_COLORS). 세 곳이 갈라지면 테마 없는 행사가 달라 보인다.
it("기본 색이 globals.css .ev-surface 토큰과 같다", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
  const block = css.slice(css.indexOf(".ev-surface {"));
  const token = (name: string) => block.match(new RegExp(`--ev-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toUpperCase();
  expect({
    bg: token("bg"),
    card: token("card"),
    text: token("text"),
    muted: token("muted"),
    border: token("border"),
    accent: token("accent"),
    accentContrast: token("accent-contrast"),
  }).toEqual(DEFAULT_PAGE_THEME_COLORS);
});
