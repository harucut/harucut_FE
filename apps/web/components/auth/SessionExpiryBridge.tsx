"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { registerSessionExpiredHandler } from "@/lib/clientApi";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isProtectedPath } from "@/lib/protectedPaths";

// 액세스 토큰 만료 후 재발급까지 실패(하드 만료)했을 때 로그인으로 유도한다.
// 보호 경로에 있고 게스트 체험 모드가 아닐 때만 이동해, 게스트/공개 화면 사용을 방해하지 않는다.
export function SessionExpiryBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const accessMode = useGuestTrialStore((state) => state.accessMode);

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      if (accessMode === "guest") return;
      if (!isProtectedPath(pathname)) return;
      const redirectTo = `${pathname}${window.location.search}`;
      router.replace(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
    });
    return () => registerSessionExpiredHandler(null);
  }, [router, pathname, accessMode]);

  return null;
}
