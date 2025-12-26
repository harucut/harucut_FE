const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 8~16자, 영문/숫자 + 일부 특수문자만 허용
const PASSWORD_REGEX = /^[A-Za-z0-9!@#$%^&*()\-_=+\[\]{};:,.?]{8,16}$/;

// 닉네임: 2~20자, 한글/영문/숫자/공백/언더바/하이픈만 허용
const USERNAME_REGEX = /^[\p{L}\p{N}_\- ]{2,20}$/u;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "이메일을 입력해 주세요.";
  if (!EMAIL_REGEX.test(value)) return "이메일 형식이 올바르지 않습니다.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "비밀번호를 입력해 주세요.";
  if (password.length < 8) return "비밀번호는 최소 8자 이상이어야 합니다.";
  if (!PASSWORD_REGEX.test(password)) {
    return "영문, 숫자, 일부 특수문자(!@#$%^&* 등)만 사용할 수 있습니다.";
  }
  return null;
}

export function validateUsername(username: string): string | null {
  const value = username.trim();
  if (!value) return "닉네임을 입력해 주세요.";
  if (!USERNAME_REGEX.test(value)) {
    return "닉네임은 2~20자의 한글/영문/숫자, 공백, _, - 만 사용할 수 있습니다.";
  }
  return null;
}
