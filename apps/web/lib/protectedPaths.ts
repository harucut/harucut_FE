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

/**
 * 로그인 없이 체험할 수 있는 보호 경로 — 촬영까지다.
 *
 * 비회원에게 여는 범위는 "찍고 그 사진을 받는 것"까지다. 기록 보관과 프레임 제작은 가입 후다.
 * 다운로드를 남긴 이유는 행사(Enterprise) 참가자 때문이다 — QR 로 들어온 참가자도 같은
 * 게스트 자격으로 찍는데, 다운로드까지 막으면 "참가자는 가입 없이 찍고 그 자리에서 가져가요"
 * 라는 판매 문구가 사실이 아니게 된다.
 */
const GUEST_ALLOWED_PREFIXES = ["/shoot"] as const;

/**
 * `/shoot` 아래이지만 회원만 쓸 수 있는 것.
 *
 * 갤러리 불러오기는 원래 `/upload` 였고 회원 전용이었다. 촬영 흐름으로 합치면서
 * `/shoot/upload` 로 옮겨 왔는데, 위 접두사 허용이 `/shoot` 전체를 열어 두는 바람에
 * **비회원에게도 딸려 열렸다.**
 *
 * 약관 제8조와 `@harucut/shared` 의 GUEST_ALLOWED_ITEMS 는 비회원 범위를
 * "사진 촬영과 이미지 저장"으로 못박고 있다. 코드가 그보다 넓으면 화면이 거짓말을 한다.
 */
const GUEST_MEMBER_ONLY_PREFIXES = ["/shoot/upload"] as const;

function hasPrefix(pathname: string, prefix: string) {
  // "/shoot/uploads" 같은 다른 경로가 "/shoot/upload" 에 걸리지 않게 경계를 본다.
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** 비회원 체험 쿠키만 가진 사람에게 열어 줄 경로인가. */
export function isGuestAllowedPath(pathname: string) {
  if (GUEST_MEMBER_ONLY_PREFIXES.some((prefix) => hasPrefix(pathname, prefix))) {
    return false;
  }
  return GUEST_ALLOWED_PREFIXES.some((prefix) => hasPrefix(pathname, prefix));
}
