/**
 * 주최자 디자인으로 그리는 행사 화면의 경로 — 개인 휴대폰 참가(`/e/{slug}`), 결과 수령(`/r`),
 * 현장 부스(`/booth`).
 *
 * 이 경로에서는 개인 서비스의 것을 돌리지 않는다(기획 R5 18절, F48·F50).
 *  - 회원 세션 만료·계정 복구·약관 재동의·게스트 체험 팝업: 참가자는 회원 자격으로 들어오지
 *    않는다. 만료된 회원 쿠키가 남아 있어도 유효한 행사 화면 위에 회원 팝업을 띄우지 않는다.
 *  - 개인 색 테마(저장된 라이트/다크 선호, 시스템 다크 모드 동기화): 행사는 게시된 테마 하나로
 *    그린다. 행사에 들어왔다고 개인의 저장된 선호를 바꾸지도 않는다.
 *
 * 카메라·외부 브라우저 전환처럼 참가에도 필요한 것은 여기서 끄지 않는다.
 * 부트스트랩 스크립트(`COLOR_THEME_BOOTSTRAP_SCRIPT`)는 이 모듈을 못 읽으므로 같은 규칙을
 * 정규식으로 따로 들고 있다 — 접두사를 바꾸면 그쪽도 함께 바꾼다(테스트가 둘을 맞춰 본다).
 */
export const EVENT_SURFACE_PREFIXES = ["/e", "/r", "/booth"] as const;

export function isEventSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // "/events"·"/reactivate" 같은 다른 경로가 걸리지 않게 세그먼트 경계를 본다.
  return EVENT_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
