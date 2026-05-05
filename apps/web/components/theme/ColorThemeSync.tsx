"use client";

import { useEffect } from "react";
import {
  applyPreferredColorTheme,
  COLOR_THEME_STORAGE_KEY,
  readStoredColorThemePreference,
  subscribeSystemColorTheme,
} from "@/lib/colorTheme";

export function ColorThemeSync() {
  useEffect(() => {
    const syncPreference = () => {
      applyPreferredColorTheme(readStoredColorThemePreference());
    };

    syncPreference();

    const unsubscribeSystem = subscribeSystemColorTheme(() => {
      if (readStoredColorThemePreference() === "system") {
        syncPreference();
      }
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === COLOR_THEME_STORAGE_KEY) {
        syncPreference();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribeSystem();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
