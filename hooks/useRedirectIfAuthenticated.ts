"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 이미 로그인된 경우, 로그인/회원가입 페이지 접근을 차단합니다.
 * 기본적으로 /home 으로 리다이렉트됩니다.
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
