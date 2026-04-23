import { getColorThemeBootstrapScript } from "@/lib/colorTheme";

export function ColorThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: getColorThemeBootstrapScript(),
      }}
    />
  );
}
