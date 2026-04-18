import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, LoginResponseData } from "@/lib/api-types";

export async function loginWithEmail(
  email: string,
  password: string,
  options?: { remember?: boolean },
) {
  const res = await clientApi.post<ApiEnvelope<LoginResponseData>>(
    "/api/client/auth/login",
    {
      email,
      password,
      remember: Boolean(options?.remember),
    },
  );

  return res.data.data;
}

export async function sendEmailAuthCode(email: string) {
  await clientApi.post("/api/client/auth/email/code", { email });
}

export async function verifyEmailAuthCode(email: string, code: string) {
  await clientApi.post("/api/client/auth/email/verification", { email, code });
}

export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  const res = await clientApi.post("/api/client/auth/register", args);
  return res.data;
}

export async function reactivateAccount() {
  await clientApi.post<ApiEnvelope<null>>("/api/client/reactivate");
}
