"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * 이미 로그인된 경우 로그인/회원가입 접근 차단
 *
 * 쓸 수 없는 세션(탈퇴 대기·탈퇴)은 「로그인 안 됨」으로 오지만 상태는 함께 온다(app/api/auth/session).
 * `onUnusableSession` 을 주면 그 상태를 받는다 — 로그인 화면이 탈퇴 대기 계정에 탈퇴 취소를 묻는 자리다.
 */
export function useRedirectIfAuthenticated(
  targetPath: string = "/home",
  onUnusableSession?: (userStatus: string) => void,
) {
  const router = useRouter();
  // 콜백은 렌더마다 새 함수라 effect 를 다시 돌리지 않게 Effect Event 로 읽는다.
  const onUnusable = useEffectEvent((userStatus: string) => onUnusableSession?.(userStatus));

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

        const data = (await res.json()) as { authenticated?: boolean; userStatus?: string | null };
        if (!data.authenticated) {
          if (data.userStatus) onUnusable(data.userStatus);
          return;
        }

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
