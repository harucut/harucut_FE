"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { registerAccountBlockedHandler, registerDeletionRequestedHandler } from "@/lib/clientApi";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { isBlockedAccountPath, isProtectedPath } from "@/lib/protectedPaths";

/**
 * 탈퇴요청(DELETED_REQUESTED) 계정이 일반 API 에서 403(GEN-021)을 받았을 때 복구로 유도한다.
 *
 * 세션 만료와 다르게 **로그아웃시키지 않는다.** 토큰은 여전히 유효하고, 탈퇴 취소는 로그인
 * 화면의 확인 흐름이 담당한다(app/login/page.tsx) — 그래서 목적지가 /login 이다.
 * 쿠키를 지우면 오히려 복구 진입로가 사라진다.
 *
 * 이 상태로는 어차피 보호 화면이 아무것도 못 부르므로 그냥 두면 빈 화면만 남는다.
 *
 * 정지 계정(403 AUTH-042)도 같은 자리에서 받는다. 이쪽은 로그인이 아니라 마이페이지로 보낸다 —
 * 정지 전에 받은 토큰은 프록시를 지나치므로, 막힌 API 를 부르는 순간 여기서 돌려보낸다.
 */
export function AccountRecoveryBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;

    registerDeletionRequestedHandler(() => {
      if (!isProtectedPath(pathname)) return;
      const redirectTo = `${pathname}${window.location.search}`;
      router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
    });
    registerAccountBlockedHandler(() => {
      if (!isBlockedAccountPath(pathname)) router.replace("/mypage");
    });
    return () => {
      registerDeletionRequestedHandler(null);
      registerAccountBlockedHandler(null);
    };
  }, [router, pathname]);

  return null;
}
