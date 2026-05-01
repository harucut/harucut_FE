"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 이미 로그인된 경우 로그인/회원가입 접근 차단
 */
export function useRedirectIfAuthenticated(targetPath: string = "/home") {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { authenticated?: boolean };
        if (!data.authenticated) return;

        router.replace(targetPath);
      } catch (error) {
        console.error("Failed to verify auth session", error);
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router, targetPath]);
}
