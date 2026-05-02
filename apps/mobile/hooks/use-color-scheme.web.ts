import { useEffect, useState } from 'react';
import {
  type ColorSchemeName,
  useColorScheme as useRNColorScheme,
} from 'react-native';

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function getWebSystemColorScheme(): NonNullable<ColorSchemeName> | null {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return null;
  }

  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light';
}

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [webSystemScheme, setWebSystemScheme] =
    useState<NonNullable<ColorSchemeName> | null>(null);

  useEffect(() => {
    setHasHydrated(true);

    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(COLOR_SCHEME_QUERY);
    const syncSystemScheme = () => {
      setWebSystemScheme(getWebSystemColorScheme());
    };

    syncSystemScheme();
    mediaQueryList.addEventListener('change', syncSystemScheme);

    return () => {
      mediaQueryList.removeEventListener('change', syncSystemScheme);
    };
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme ?? webSystemScheme;
  }

  return 'light';
}
