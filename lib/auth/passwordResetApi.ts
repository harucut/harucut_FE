import { api } from "@/lib/api";

export type ResetTokenResponse = {
  code: string;
  status: number;
  message: string | null;
  data: { resetToken: string };
};

export async function requestPasswordResetCode(email: string) {
  await api.post("/api/email-auth/code", { email });
}

export async function verifyPasswordResetCode(email: string, code: string) {
  const res = await api.post<ResetTokenResponse>(
    "/api/recorday/reset/password/verification",
    { email, code }
  );

  const token = res.data?.data?.resetToken;
  if (!token) throw new Error("resetToken missing");
  return token;
}

export async function resetPassword(resetToken: string, newPassword: string) {
  await api.patch("/api/recorday/reset/password", { resetToken, newPassword });
}
