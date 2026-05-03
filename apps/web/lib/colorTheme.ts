export const COLOR_THEME_STORAGE_KEY = "harucut-web-color-theme";
export const COLOR_THEME_ATTRIBUTE = "data-theme";
export const COLOR_THEME_SYSTEM_QUERY = "(prefers-color-scheme: dark)";

export const COLOR_THEMES = ["light", "dark"] as const;
export const COLOR_THEME_PREFERENCES = ["system", ...COLOR_THEMES] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];
export type ColorThemePreference = (typeof COLOR_THEME_PREFERENCES)[number];

export const DEFAULT_COLOR_THEME: ColorTheme = "light";
export const DEFAULT_COLOR_THEME_PREFERENCE: ColorThemePreference = "system";

export function isColorTheme(value: string | null | undefined): value is ColorTheme {
  return value === "light" || value === "dark";
}

export function isColorThemePreference(
  value: string | null | undefined,
): value is ColorThemePreference {
  return value === "system" || isColorTheme(value);
}

export function getSystemColorTheme(): ColorTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return DEFAULT_COLOR_THEME;
  }

  return window.matchMedia(COLOR_THEME_SYSTEM_QUERY).matches ? "dark" : "light";
}

export function resolveColorTheme(value: string | null | undefined): ColorTheme {
  return isColorTheme(value) ? value : getSystemColorTheme();
}

export function resolveColorThemePreference(
  value: string | null | undefined,
): ColorThemePreference {
  return isColorThemePreference(value) ? value : DEFAULT_COLOR_THEME_PREFERENCE;
}

export function resolveEffectiveColorTheme(
  preference: ColorThemePreference,
): ColorTheme {
  return preference === "system" ? getSystemColorTheme() : preference;
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

export function applyPreferredColorTheme(preference: ColorThemePreference) {
  const theme = resolveEffectiveColorTheme(preference);
  applyColorTheme(theme);
  return theme;
}

export function persistColorThemePreference(preference: ColorThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, preference);
}

export function readStoredColorTheme() {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  return resolveColorTheme(window.localStorage.getItem(COLOR_THEME_STORAGE_KEY));
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
