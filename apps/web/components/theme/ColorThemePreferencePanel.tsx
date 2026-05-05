"use client";

import { CheckCircle2, Monitor, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyPreferredColorTheme,
  COLOR_THEME_PREFERENCES,
  persistColorThemePreference,
  readStoredColorThemePreference,
  subscribeSystemColorTheme,
  type ColorTheme,
  type ColorThemePreference,
} from "@/lib/colorTheme";

const THEME_META: Record<
  ColorThemePreference,
  {
    description: string;
    icon: typeof Monitor;
    label: string;
  }
> = {
  system: {
    description: "기기 설정이 바뀌면 하루컷 화면도 함께 바뀌어요.",
    icon: Monitor,
    label: "시스템",
  },
  light: {
    description: "밝은 화면으로 고정해요.",
    icon: SunMedium,
    label: "라이트",
  },
  dark: {
    description: "어두운 화면으로 고정해요.",
    icon: MoonStar,
    label: "다크",
  },
};

export function ColorThemePreferencePanel() {
  const [preference, setPreference] =
    useState<ColorThemePreference>("system");
  const [effectiveTheme, setEffectiveTheme] = useState<ColorTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedPreference = readStoredColorThemePreference();
    const nextTheme = applyPreferredColorTheme(storedPreference);
    const frame = window.requestAnimationFrame(() => {
      setPreference(storedPreference);
      setEffectiveTheme(nextTheme);
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (preference !== "system") {
      return;
    }

    return subscribeSystemColorTheme((nextTheme) => {
      applyPreferredColorTheme("system");
      setEffectiveTheme(nextTheme);
    });
  }, [preference]);

  const handlePreferenceChange = (nextPreference: ColorThemePreference) => {
    persistColorThemePreference(nextPreference);
    const nextTheme = applyPreferredColorTheme(nextPreference);

    setPreference(nextPreference);
    setEffectiveTheme(nextTheme);
  };

  return (
    <section className="rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--hc-primary)]">
          Display
        </p>
        <h2 className="mt-2 text-sm font-semibold">화면 모드</h2>
        <p className="mt-1 text-[11px] leading-5 text-[color:var(--hc-muted)]">
          기본값은 시스템 설정을 따르고, 여기에서 원하는 모드로 고정할 수 있어요.
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {COLOR_THEME_PREFERENCES.map((item) => {
          const meta = THEME_META[item];
          const Icon = meta.icon;
          const active = mounted && preference === item;

          return (
            <button
              key={item}
              type="button"
              onClick={() => handlePreferenceChange(item)}
              aria-pressed={active}
              className="flex min-h-14 w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition"
              style={{
                background: active
                  ? "var(--hc-theme-toggle-active-bg)"
                  : "var(--hc-surface-strong)",
                borderColor: active
                  ? "var(--hc-border-strong)"
                  : "var(--hc-border)",
                color: "var(--hc-text)",
              }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[color:var(--hc-border)] bg-[color:var(--hc-surface-muted)]">
                  <Icon className="h-4 w-4 text-[color:var(--hc-primary)]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold">
                    {meta.label}
                    {item === "system" && mounted
                      ? ` · 현재 ${effectiveTheme === "dark" ? "다크" : "라이트"}`
                      : ""}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--hc-muted)]">
                    {meta.description}
                  </span>
                </span>
              </span>
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                style={{
                  color: active
                    ? "var(--hc-theme-toggle-active-text)"
                    : "var(--hc-muted)",
                }}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
