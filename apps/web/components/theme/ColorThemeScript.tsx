import Script from "next/script";
import { COLOR_THEME_BOOTSTRAP_SCRIPT } from "@/lib/colorTheme";

export function ColorThemeScript() {
  return (
    <Script id="harucut-color-theme" strategy="beforeInteractive">
      {COLOR_THEME_BOOTSTRAP_SCRIPT}
    </Script>
  );
}
