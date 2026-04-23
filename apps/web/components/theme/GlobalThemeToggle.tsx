"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyColorTheme,
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  persistColorTheme,
  readStoredColorTheme,
  type ColorTheme,
} from "@/lib/colorTheme";

const THEME_META: Record<
  ColorTheme,
  { icon: typeof SunMedium; label: string; title: string }
> = {
  light: {
    icon: SunMedium,
    label: "Light",
    title: "라이트 모드",
  },
  dark: {
    icon: MoonStar,
    label: "Dark",
    title: "다크 모드",
  },
};

export function GlobalThemeToggle() {
  const [theme, setTheme] = useState<ColorTheme>(DEFAULT_COLOR_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const nextTheme = readStoredColorTheme();
    applyColorTheme(nextTheme);

    const frame = window.requestAnimationFrame(() => {
      setTheme(nextTheme);
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleThemeChange = (nextTheme: ColorTheme) => {
    applyColorTheme(nextTheme);
    persistColorTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[130]">
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-full border p-1 backdrop-blur-xl"
        style={{
          background: "var(--hc-theme-toggle-bg)",
          borderColor: "var(--hc-border)",
          boxShadow: "var(--hc-theme-toggle-shadow)",
        }}
      >
        {COLOR_THEMES.map((item) => {
          const meta = THEME_META[item];
          const Icon = meta.icon;
          const active = mounted && theme === item;

          return (
            <button
              key={item}
              type="button"
              onClick={() => handleThemeChange(item)}
              className="inline-flex min-w-[84px] items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium transition-colors sm:min-w-[92px]"
              style={{
                background: active
                  ? "var(--hc-theme-toggle-active-bg)"
                  : "transparent",
                color: active
                  ? "var(--hc-theme-toggle-active-text)"
                  : "var(--hc-muted-soft)",
              }}
              aria-pressed={active}
              title={meta.title}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
