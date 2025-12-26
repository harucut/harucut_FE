"use client";

type SetAuthCookiesArgs = {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs?: number;
  refreshMaxAgeMs?: number;
  sameSite?: "Lax" | "Strict" | "None";
};

export function setAuthCookies({
  accessToken,
  refreshToken,
  accessMaxAgeMs = 60 * 60 * 1000, // 1 hour
  refreshMaxAgeMs = 14 * 24 * 60 * 60 * 1000, // 14 days
  sameSite = "Lax",
}: SetAuthCookiesArgs) {
  const accessExpires = new Date(Date.now() + accessMaxAgeMs).toUTCString();
  const refreshExpires = new Date(Date.now() + refreshMaxAgeMs).toUTCString();

  document.cookie = `accessToken=${encodeURIComponent(
    accessToken
  )}; Path=/; Expires=${accessExpires}; SameSite=${sameSite}`;

  document.cookie = `refreshToken=${encodeURIComponent(
    refreshToken
  )}; Path=/; Expires=${refreshExpires}; SameSite=${sameSite}`;
}

export function clearAuthCookies() {
  const expired = new Date(0).toUTCString();
  document.cookie = `accessToken=; Path=/; Expires=${expired}; SameSite=Lax`;
  document.cookie = `refreshToken=; Path=/; Expires=${expired}; SameSite=Lax`;
}
