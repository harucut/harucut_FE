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

    const checkAuth = async () => {
      try {
        const res = await fetch("/api/client/user-info", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok || cancelled) return;

        router.replace(targetPath);
      } catch (error) {
        console.error("Failed to verify auth status", error);
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router, targetPath]);
}
