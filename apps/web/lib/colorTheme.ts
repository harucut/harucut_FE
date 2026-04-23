export const COLOR_THEME_STORAGE_KEY = "harucut-web-color-theme";
export const COLOR_THEME_ATTRIBUTE = "data-theme";

export const COLOR_THEMES = ["light", "dark"] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "light";

export function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return value === "light" || value === "dark";
}

export function resolveColorTheme(value: string | null | undefined): ColorTheme {
  return isColorTheme(value) ? value : DEFAULT_COLOR_THEME;
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute(COLOR_THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;
}

export function persistColorTheme(theme: ColorTheme) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
}

export function readStoredColorTheme() {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  return resolveColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY));
}

export const COLOR_THEME_BOOTSTRAP_SCRIPT = `(function(){
try {
  var stored = window.localStorage.getItem("harucut-web-color-theme");
  var theme = stored === "dark" || stored === "light" ? stored : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
} catch (error) {
  document.documentElement.setAttribute("data-theme", "light");
  document.documentElement.style.colorScheme = "light";
}
})();`;
