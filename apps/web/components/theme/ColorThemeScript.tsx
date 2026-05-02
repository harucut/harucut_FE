import { COLOR_THEME_BOOTSTRAP_SCRIPT } from "@/lib/colorTheme";

export function ColorThemeScript() {
  return (
    <script
      id="harucut-color-theme"
      dangerouslySetInnerHTML={{ __html: COLOR_THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
