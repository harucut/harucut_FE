/**
 * 다크 무대는 머무는 **동안** 계속 다크여야 한다.
 *
 * 상시 도는 `ColorThemeSync` 는 다른 탭 동기화와 시스템 테마 변경마다 실제 테마를 다시 적용한다
 * (둘 다 `applyPreferredColorTheme` 한 곳으로 모인다). 무대가 마운트 때 한 번만 다크를 보내면
 * 그 뒤 첫 변경에서 상태바 글자와 theme-color 만 라이트로 돌아가, 화면은 어두운데 상태바와
 * 브라우저 크롬만 밝은 상태가 된다. 그 회귀를 여기서 못박는다.
 */
import { render } from "@testing-library/react";
import { ColorThemeSync } from "@/components/theme/ColorThemeSync";
import { useDarkStage } from "@/hooks/useDarkStage";
import { COLOR_THEME_STORAGE_KEY } from "@/lib/colorTheme";

type Posted = { type: string; scheme?: string };

let posted: Posted[];

function DarkStage() {
  useDarkStage();
  return null;
}

/** layout.tsx 가 media 분기로 두 개를 심는다. 어느 쪽이 골라져도 화면과 같아야 한다. */
function themeColors() {
  return Array.from(
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ).map((meta) => meta.getAttribute("content"));
}

/** 셸이 받은 마지막 상태바 지시. */
function lastNativeScheme() {
  return posted.filter((message) => message.type === "theme").at(-1)?.scheme;
}

beforeEach(() => {
  document.head.innerHTML = `
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fafaf7" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0c" />
  `;
  window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, "light");

  // 상태바는 앱 셸 안에서만 움직인다. 셸인 척해야 지시가 보인다.
  posted = [];
  window.__HARUCUT_NATIVE__ = { version: 1, platform: "android" };
  window.ReactNativeWebView = {
    postMessage: (raw: string) => {
      posted.push(JSON.parse(raw) as Posted);
    },
  };
});

afterEach(() => {
  window.localStorage.clear();
  delete window.__HARUCUT_NATIVE__;
  delete window.ReactNativeWebView;
});

it("머무는 동안 다른 탭이 테마를 바꿔도 상태바와 theme-color 는 다크로 남는다", () => {
  render(
    <>
      <ColorThemeSync />
      <DarkStage />
    </>,
  );

  expect(themeColors()).toEqual(["#0b0b0c", "#0b0b0c"]);
  expect(lastNativeScheme()).toBe("dark");

  window.dispatchEvent(
    new StorageEvent("storage", { key: COLOR_THEME_STORAGE_KEY, newValue: "light" }),
  );

  expect(themeColors()).toEqual(["#0b0b0c", "#0b0b0c"]);
  expect(lastNativeScheme()).toBe("dark");
  // 무대는 자기 색을 직접 칠한다 — 페이지 테마까지 다크로 끌고 가지는 않는다.
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});

it("무대를 떠나면 실제 테마로 되돌린다", () => {
  const view = render(
    <>
      <ColorThemeSync />
      <DarkStage />
    </>,
  );

  view.unmount();

  expect(themeColors()).toEqual(["#fafaf7", "#fafaf7"]);
  expect(lastNativeScheme()).toBe("light");
});
