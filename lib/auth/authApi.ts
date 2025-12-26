import { api } from "@/lib/api";

type LoginResponse = {
  data: {
    accessToken: string;
    refreshToken: string;
  };
};

export async function loginWithEmail(email: string, password: string) {
  const res = await api.post("/api/recorday/login", { email, password });
  const { accessToken, refreshToken } = res.data.data as LoginResponse["data"];
  return { accessToken, refreshToken };
}

export async function sendEmailAuthCode(email: string) {
  await api.post("/api/email-auth/code", { email });
}

export async function verifyEmailAuthCode(email: string, code: string) {
  await api.post("/api/email-auth/verification", { email, code });
}

export async function signupWithEmail(args: {
  email: string;
  password: string;
  username: string;
}) {
  const res = await api.post("/api/recorday/register", args);
  return res.data;
}
