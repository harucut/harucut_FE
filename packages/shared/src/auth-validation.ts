// 웹/모바일이 공유하는 인증 입력 검증 규칙.

// 이메일 형식(기본). 도메인은 점으로 구분된 라벨로 검사한다
// (문자 클래스에서 점을 제외해 백트래킹 모호성이 없는 선형 패턴 — ReDoS 방지).
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// 비밀번호 규칙: 8~16자, 영문/숫자/일부 특수문자
const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()\-_=+\[\]{};:,.?]{8,16}$/;

// 닉네임 규칙: 2~20자, 한글/영문/숫자/공백/_/-
const USERNAME_REGEX = /^[\p{L}\p{N}_\- ]{2,20}$/u;

/**
 * 이메일 유효성 검사
 * - 빈 값/형식 오류를 사용자 메시지로 반환
 */
export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return '이메일을 입력해 주세요.';
  if (!EMAIL_REGEX.test(value)) return '이메일 형식이 올바르지 않습니다.';
  return null;
}

/**
 * 비밀번호 유효성 검사
 */
export function validatePassword(password: string): string | null {
  if (!password) return '비밀번호를 입력해 주세요.';
  if (password.length < 8) return '비밀번호는 최소 8자 이상이어야 합니다.';
  if (!PASSWORD_REGEX.test(password)) {
    return '영문, 숫자, 일부 특수문자(!@#$%^&* 등)만 사용할 수 있습니다.';
  }
  return null;
}

/**
 * 닉네임 유효성 검사
 */
export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return '닉네임을 입력해 주세요.';
  if (!USERNAME_REGEX.test(value)) {
    return '닉네임은 2~20자의 한글/영문/숫자, 공백, _, - 만 사용할 수 있습니다.';
  }
  return null;
}
