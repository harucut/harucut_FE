/**
 * 받은 초대 토큰을 로그인하는 동안 잠깐 둔다.
 *
 * 토큰은 `/invite#<token>` 의 fragment 로 온다(서버 로그·리퍼러에 남지 않게). 로그인하러 다녀오면
 * fragment 는 돌아오지 않는다 — `redirectTo` 가 경로만 싣기 때문이다. 그래서 이 탭의 sessionStorage 에만
 * 두고, 수락·거절·오류가 나면 바로 지운다. localStorage 에 두지 않는다 — 공용 기기에서 다음 사람이 줍는다.
 */
const KEY = "harucut:pending-invite";

/** 32바이트 불투명 토큰(base64url 등). 모양만 본다 — 진짜인지는 서버가 정한다. */
export function isInviteToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,128}$/.test(value);
}

export function stashInviteToken(token: string) {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // 막힌 저장소 — 이번 화면에서는 메모리로 이어 간다.
  }
}

export function readInviteToken(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && isInviteToken(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearInviteToken() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 막힌 저장소
  }
}
