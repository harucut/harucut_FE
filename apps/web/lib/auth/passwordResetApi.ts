import { clientApi } from "@/lib/clientApi";

export type ResetTokenResponse = {
  code: string;
  status: number;
  message: string | null;
  data: { resetToken: string };
};

/** 비밀번호 재설정 코드 전송 */
export async function requestPasswordResetCode(email: string) {
  await clientApi.post("/api/client/auth/email/code", { email });
}

/** 재설정 코드 검증 후 resetToken 반환 */
export async function verifyPasswordResetCode(email: string, code: string) {
  const res = await clientApi.post<ResetTokenResponse>(
    "/api/client/auth/password/reset/verification",
    { email, code },
  );

  const token = res.data?.data?.resetToken;
  if (!token) throw new Error("resetToken missing");
  return token;
}

/** resetToken으로 새 비밀번호 설정 */
export async function resetPassword(resetToken: string, newPassword: string) {
  await clientApi.patch("/api/client/auth/password/reset", {
    resetToken,
    newPassword,
  });
}
