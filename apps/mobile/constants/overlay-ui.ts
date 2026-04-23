export const APP_NAV_ROUTE_PREFIXES = [
  '/home',
  '/shoot',
  '/upload',
  '/theme',
  '/history',
  '/mypage',
] as const;

export const GLOBAL_THEME_TOGGLE_HEIGHT = 48;

export function hasBottomNavigation(pathname: string) {
  return APP_NAV_ROUTE_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function getGlobalThemeToggleBottomOffset(
  pathname: string,
  insetBottom: number,
) {
  if (hasBottomNavigation(pathname)) {
    return Math.max(insetBottom, 12) + 84;
  }

  return Math.max(insetBottom, 24) + 12;
}

export function getGlobalThemeScrollPadding(
  pathname: string,
  insetBottom: number,
) {
  return (
    getGlobalThemeToggleBottomOffset(pathname, insetBottom) +
    GLOBAL_THEME_TOGGLE_HEIGHT +
    18
  );
}
