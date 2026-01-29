import { api } from "@/lib/api";

export async function loginWithEmail(email: string, password: string) {
  await api.post("/api/harucut/login", { email, password });
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
  const res = await api.post("/api/harucut/register", args);
  return res.data;
}
