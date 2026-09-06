"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { registerSessionExpiredHandler } from "@/lib/clientApi";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isProtectedPath } from "@/lib/protectedPaths";

/**
 * 액세스 토큰 만료 후 재발급까지 실패(하드 만료)했을 때 다시 로그인하도록 안내한다.
 * 보호 경로에 있고 게스트 체험 모드가 아닐 때만 안내해, 게스트/공개 화면 사용을 방해하지 않는다.
 *
 * **말없이 화면을 갈아치우지 않는다 — 이유를 말하고 이동은 사용자가 고른다.**
 *
 * 로그인은 문서를 새로 받는다(`app/login/page.tsx` 의 `window.location.href`). 그래서 로그인
 * 화면으로 넘어가는 순간 메모리에만 있던 것이 통째로 사라진다 — 촬영한 8장(`lib/shootSessionStore.ts`
 * 는 비영속 zustand 다), 꾸미던 프레임, 쓰다 만 폼. 예전에는 그것을 `router.replace` 로 말없이
 * 했다. 사용자는 촬영 도중 이유 없이 로그인 폼을 만났고, `replace` 라 돌아갈 히스토리 항목까지
 * 없었다. 프로그램적 이동이라 `useUnsavedWorkGuard` 의 이탈 경고도 걸리지 않는다.
 *
 * 지금은 안내를 띄우고 두 갈래를 준다. "다시 로그인하기" 는 오버레이가 `router.push` 로 보내므로
 * (`components/guest/GuestTrialOverlay.tsx`), 마음이 바뀌면 뒤로 가기로 하던 화면에 돌아올 수
 * 있다 — 같은 문서 안의 이동이라 그때까지는 세션이 메모리에 그대로 있다.
 *
 * 찍은 사진을 **로그인 뒤까지 살려 오는 것**은 아직 없다. 그것은 디스크 보관소와 복귀 후
 * 복원 지점이 함께 있어야 하는 일이라 이 파일 밖이다. 여기서 하는 것은 하나다 —
 * 사라진다는 사실을 말하고, 언제 잃을지를 사용자가 정하게 한다.
 */
export function SessionExpiryBridge() {
  const pathname = usePathname();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  /*
    이 화면에서 이미 안내했는가.

    만료는 실패한 요청마다 한 번씩 온다(`lib/clientApi.ts`). 화면 하나가 여러 요청을 나란히
    보내면 안내도 그만큼 오는데, 막지 않으면 사용자가 닫은 안내가 곧바로 다시 뜬다.
    이동으로 화면이 사라지던 예전에는 드러나지 않던 문제다.
  */
  const noticedPathRef = useRef<string | null>(null);

  useEffect(() => {
    // 로컬 개발 우회 중에는 백엔드가 401을 줘도 로그인으로 유도하지 않는다.
    if (DEV_AUTH_BYPASS) return;

    registerSessionExpiredHandler(() => {
      if (accessMode === "guest") return;
      if (!isProtectedPath(pathname)) return;
      if (noticedPathRef.current === pathname) return;
      noticedPathRef.current = pathname;

      const redirectTo = `${pathname}${window.location.search}`;
      setNotice({
        actions: [
          {
            id: "go-login",
            label: "다시 로그인하기",
            href: `/login?redirectTo=${encodeURIComponent(redirectTo)}`,
          },
          { id: "dismiss", label: "이 화면에 머무르기", variant: "secondary" },
        ],
        eyebrow: "NOTICE",
        icon: "lock",
        message:
          "다시 로그인해야 저장하거나 불러올 수 있어요. 로그인 화면으로 가면 이 화면에서 하던 작업은 남지 않아요.",
        title: "로그인이 풀렸어요",
      });
    });
    return () => registerSessionExpiredHandler(null);
  }, [accessMode, pathname, setNotice]);

  return null;
}
