export const PROTECTED_PATHS = [
  "/home",
  "/shoot",
  "/history",
  "/theme",
  "/mypage",
] as const;

export function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}
