export const PROTECTED_PATHS = [
  "/home",
  "/shoot",
  "/history",
  "/theme",
  "/mypage",
  // 고객용 Studio(행사 운영). 운영자 API 는 조직 공간 역할을 서버가 다시 본다.
  "/studio",
  // 하루컷 플랫폼 CMS. 로그인만 여기서 보고, ADMIN 권한은 백엔드가 /api/admin/** 에서 본다.
  "/admin",
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

function hasPrefix(pathname: string, prefix: string) {
  // "/shootings" 같은 다른 경로가 "/shoot" 에 걸리지 않게 경계를 본다.
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * 정지 계정이 들어갈 수 있는 보호 경로. 쓰지는 못하고 마이페이지에서 로그아웃과 탈퇴만 한다.
 * 나머지 보호 경로는 프록시가 여기로 돌려보내고, 실제 집행은 백엔드가 403 AUTH-042 로 한다.
 */
export function isBlockedAccountPath(pathname: string) {
  return hasPrefix(toRoutePath(pathname), "/mypage");
}

/**
 * 같은 페이지를 가리키는 여러 주소 모양을 한 갈래로 되돌린다.
 *
 * App Router 는 한 라우트를 사람이 치는 주소로만 부르지 않는다. 세그먼트 프리페치는
 * `/mypage.segments/_tree.segment`, 그 밖에 `.html`·`.meta` 같은 꼬리표도 붙는다.
 * 프록시가 받는 `nextUrl.pathname` 에는 이 꼬리표가 그대로 남아 있어서, 문자열을 있는 그대로
 * 비교하면 **같은 페이지인데 판정이 빗나간다**(예전에 회원 전용이던 갤러리 불러오기 화면에서 실제로 났다).
 *
 * 꼬리표를 나열해 지우는 대신 세그먼트마다 첫 `.` 에서 자른다. 이 앱의 라우트 세그먼트에는
 * 점이 없으므로, 앞으로 Next 가 새 꼬리표를 만들어도 열리는 쪽이 아니라 닫히는 쪽으로 떨어진다.
 */
function toRoutePath(pathname: string) {
  return pathname
    .split("/")
    .map((segment) => segment.split(".")[0])
    .join("/");
}

/** 비회원 체험 쿠키만 가진 사람에게 열어 줄 경로인가. */
export function isGuestAllowedPath(pathname: string) {
  /*
    촬영 흐름 안에는 회원만 쓰는 것이 하나 있다 — 갤러리에서 불러오기. 예전에는 따로 화면(/shoot/upload)이라
    여기서 막았는데, 2026-11-15 사진 고르기 화면 안으로 합쳤다. 이제 그 칸은 화면이 회원에게만 보이고, 들어가기
    전 확인은 프레임 고르기가 한다(app/shoot/page.tsx · app/shoot/select/page.tsx).
  */
  return GUEST_ALLOWED_PREFIXES.some((prefix) => hasPrefix(toRoutePath(pathname), prefix));
}
