"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { registerSessionExpiredHandler } from "@/lib/clientApi";
import { DEV_AUTH_BYPASS } from "@/lib/devAuthBypass";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import { isProtectedPath } from "@/lib/protectedPaths";

/** 재발급까지 실패하면 현재 작업을 지키며 사용자가 재로그인 시점을 고르게 한다.
 * 촬영 원본은 shootSessionPersistence가 복원한다. 보관 실패는 촬영 화면에서 별도로 알린다.
 */
export function SessionExpiryBridge() {
  const pathname = usePathname();
  const accessMode = useGuestTrialStore((state) => state.accessMode);
  const setNotice = useGuestTrialStore((state) => state.setNotice);
  /*
    이번 방문에서 이미 안내했는가.

    만료는 실패한 요청마다 한 번씩 온다(`lib/clientApi.ts`). 화면 하나가 여러 요청을 나란히
    보내면 안내도 그만큼 오는데, 막지 않으면 사용자가 닫은 안내가 곧바로 다시 뜬다.
    이동으로 화면이 사라지던 예전에는 드러나지 않던 문제다.

    억제하는 범위는 **한 번의 방문**이다. 표식을 경로에 묶어 두면 안내를 닫고 떠났다가 같은
    화면으로 돌아왔을 때 표식이 그대로 남는다 — 이 브리지는 루트 레이아웃에 있어 이동으로
    언마운트되지 않으므로, 그 경로에서는 다시 401 을 받아도 영영 아무 말도 못 하게 된다.
  */
  const noticedInVisitRef = useRef(false);

  /*
    방문이 끝나면 표식을 지운다.

    의존성은 `pathname` 하나다. 아래 등록 effect(`[accessMode, pathname, setNotice]`) 안에서
    지우면 accessMode·setNotice 가 바뀔 때도 같이 지워져, 한 화면에서 닫은 안내가 되살아나는
    원래 문제로 돌아간다. 그것 하나가 이 effect 를 따로 두는 이유다.

    (선언 순서는 읽는 순서를 맞춘 것일 뿐 판정에 걸리지 않는다. 핸들러는 fetch 가 끝난 뒤
    비동기로만 불리므로 React 의 effect 플러시 사이에 끼어들 수 없다.)
  */
  useEffect(() => {
    noticedInVisitRef.current = false;
  }, [pathname]);

  useEffect(() => {
    // 로컬 개발 우회 중에는 백엔드가 401을 줘도 로그인으로 유도하지 않는다.
    if (DEV_AUTH_BYPASS) return;

    registerSessionExpiredHandler(() => {
      if (accessMode === "guest") return;
      if (!isProtectedPath(pathname)) return;
      if (noticedInVisitRef.current) return;
      noticedInVisitRef.current = true;

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
          "다시 로그인해야 저장하거나 불러올 수 있어요. 촬영 사진은 이 기기에 임시 보관되지만, 저장소를 사용할 수 없거나 창을 닫으면 작업을 잃을 수 있어요.",
        title: "로그인이 풀렸어요",
      });
    });
    return () => registerSessionExpiredHandler(null);
  }, [accessMode, pathname, setNotice]);

  return null;
}
