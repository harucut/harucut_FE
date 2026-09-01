import { nativeSetColorScheme } from "@/lib/nativeBridge";

// localStorage에는 '선호(system/light/dark)'를 저장한다 — 확정된 테마가 아니다.
// 외부(컴포넌트)에 공개하는 표면은 선호 기반 API 8개뿐이고, 나머지는 이 파일 내부 구현이다.
export const COLOR_THEME_STORAGE_KEY = "harucut-web-color-theme";
const COLOR_THEME_ATTRIBUTE = "data-theme";
const COLOR_THEME_SYSTEM_QUERY = "(prefers-color-scheme: dark)";

const COLOR_THEMES = ["light", "dark"] as const;
export const COLOR_THEME_PREFERENCES = ["system", ...COLOR_THEMES] as const;

type ColorTheme = (typeof COLOR_THEMES)[number];
export type ColorThemePreference = (typeof COLOR_THEME_PREFERENCES)[number];

const DEFAULT_COLOR_THEME: ColorTheme = "light";
const DEFAULT_COLOR_THEME_PREFERENCE: ColorThemePreference = "system";

function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return value === "light" || value === "dark";
}

function isColorThemePreference(
  value: string | null | undefined,
): value is ColorThemePreference {
  return value === "system" || isColorTheme(value);
}

function getSystemColorTheme(): ColorTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return DEFAULT_COLOR_THEME;
  }

  return window.matchMedia(COLOR_THEME_SYSTEM_QUERY).matches ? "dark" : "light";
}

function resolveColorThemePreference(
  value: string | null | undefined,
): ColorThemePreference {
  return isColorThemePreference(value) ? value : DEFAULT_COLOR_THEME_PREFERENCE;
}

function resolveEffectiveColorTheme(
  preference: ColorThemePreference,
): ColorTheme {
  return preference === "system" ? getSystemColorTheme() : preference;
}

function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute(COLOR_THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;

  // 앱 셸 안이면 네이티브 상태바도 같이 맞춘다. 여기가 테마가 실제로 바뀌는 유일한
  // 지점이라(선호값 변경·시스템 변경·다른 탭 동기화가 전부 여기로 모인다) 한 번만 걸면 된다.
  // 브라우저에서는 아무 일도 하지 않는다.
  nativeSetColorScheme(theme);
}

export function applyPreferredColorTheme(preference: ColorThemePreference) {
  const theme = resolveEffectiveColorTheme(preference);
  applyColorTheme(theme);
  return theme;
}

export function persistColorThemePreference(preference: ColorThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, preference);
}

export function readStoredColorThemePreference() {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME_PREFERENCE;
  return resolveColorThemePreference(
    window.localStorage.getItem(COLOR_THEME_STORAGE_KEY),
  );
}

export function subscribeSystemColorTheme(
  callback: (theme: ColorTheme) => void,
) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined;
  }

  const mediaQueryList = window.matchMedia(COLOR_THEME_SYSTEM_QUERY);
  const handleChange = () => callback(getSystemColorTheme());

  mediaQueryList.addEventListener("change", handleChange);

  return () => {
    mediaQueryList.removeEventListener("change", handleChange);
  };
}

export const COLOR_THEME_BOOTSTRAP_SCRIPT = `(function(){
try {
  var stored = window.localStorage.getItem("harucut-web-color-theme");
  var theme = stored === "dark" || stored === "light"
    ? stored
    : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
} catch (error) {
  document.documentElement.setAttribute("data-theme", "light");
  document.documentElement.style.colorScheme = "light";
}
})();`;
