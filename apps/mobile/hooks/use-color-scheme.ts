import {
  type ColorSchemeName,
  useColorScheme as useRNColorScheme,
} from 'react-native';

export type SupportedColorScheme = 'light' | 'dark';

export function normalizeColorScheme(
  colorScheme: ColorSchemeName,
): SupportedColorScheme {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export function useColorScheme(): SupportedColorScheme {
  return normalizeColorScheme(useRNColorScheme());
}
