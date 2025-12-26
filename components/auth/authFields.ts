export type AuthFieldName =
  | "email"
  | "password"
  | "confirmPassword"
  | "username";

export type AuthFieldConfig = {
  id: string;
  name: AuthFieldName;
  type: "email" | "password" | "text";
  label: string;
  placeholder?: string;
  autoComplete?: string;
};

export const LOGIN_FIELDS: AuthFieldConfig[] = [
  {
    id: "login-email",
    name: "email",
    type: "email",
    label: "이메일",
    placeholder: "example@recorday.com",
    autoComplete: "email",
  },
  {
    id: "login-password",
    name: "password",
    type: "password",
    label: "비밀번호",
    placeholder: "비밀번호를 입력해 주세요",
    autoComplete: "current-password",
  },
];

export const EMAIL_FIELD: AuthFieldConfig = {
  id: "email",
  name: "email",
  type: "email",
  label: "이메일",
  placeholder: "example@recorday.com",
  autoComplete: "email",
};

export const SIGNUP_BASE_FIELDS: AuthFieldConfig[] = [
  {
    id: "signup-password",
    name: "password",
    type: "password",
    label: "비밀번호",
    placeholder: "8~16자, 영문/숫자/일부 특수문자",
    autoComplete: "new-password",
  },
  {
    id: "signup-confirmPassword",
    name: "confirmPassword",
    type: "password",
    label: "비밀번호 확인",
    placeholder: "비밀번호를 한 번 더 입력해 주세요",
    autoComplete: "new-password",
  },
  {
    id: "signup-username",
    name: "username",
    type: "text",
    label: "닉네임",
    placeholder: "2~20자 (한글/영문/숫자/공백/_/-)",
    autoComplete: "username",
  },
];
