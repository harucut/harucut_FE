import { validatePassword } from "../authValidation";

export function validatePasswordPair(p1: string, p2: string) {
  const err = validatePassword(p1);
  if (err) return { field: "password", message: err };
  if (!p2)
    return {
      field: "confirmPassword",
      message: "비밀번호 확인을 입력해 주세요.",
    };
  if (p1 !== p2)
    return {
      field: "confirmPassword",
      message: "비밀번호가 일치하지 않습니다.",
    };
  return null;
}
