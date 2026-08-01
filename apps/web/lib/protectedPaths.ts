export const PROTECTED_PATHS = [
  "/home",
  "/shoot",
  "/upload",
  // 서버 저장(uploadGeneratedFourcutFile)을 하는 화면이라 보호 경로에 포함한다.
  // 게스트 체험은 proxy.ts에서 따로 통과시킨다.
  "/decorate",
  "/history",
  "/theme",
  "/mypage",
] as const;

export function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}
