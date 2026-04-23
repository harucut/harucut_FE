import { useMemo } from 'react';

import { HARUCUT_THEME_COLORS } from '@/constants/harucut-design';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHarucutStore } from '@/store/use-harucut-store';

export function useHarucutTheme() {
  const systemScheme = useColorScheme();
  const preference = useHarucutStore((state) => state.themePreference);

  return useMemo(() => {
    const scheme =
      preference === 'system' ? (systemScheme ?? 'light') : preference;
    const isDark = scheme === 'dark';

    return {
      colors: HARUCUT_THEME_COLORS[scheme],
      isDark,
      preference,
      scheme,
    };
  }, [preference, systemScheme]);
}
