import { api } from "@/lib/api";

export type ResetTokenResponse = {
  code: string;
  status: number;
  message: string | null;
  data: { resetToken: string };
};

/** 비밀번호 재설정 코드 전송 */
export async function requestPasswordResetCode(email: string) {
  await api.post("/api/email-auth/code", { email });
}

/** 재설정 코드 검증 후 resetToken 반환 */
export async function verifyPasswordResetCode(email: string, code: string) {
  const res = await api.post<ResetTokenResponse>(
    "/api/harucut/reset/password/verification",
    { email, code },
  );

  const token = res.data?.data?.resetToken;
  if (!token) throw new Error("resetToken missing");
  return token;
}

/** resetToken으로 새 비밀번호 설정 */
export async function resetPassword(resetToken: string, newPassword: string) {
  await api.patch("/api/harucut/reset/password", { resetToken, newPassword });
}
