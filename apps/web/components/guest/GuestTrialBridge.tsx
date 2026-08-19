"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuestTrialOverlay } from "@/components/guest/GuestTrialOverlay";
import { useGuestTrialStore } from "@/lib/guestTrialStore";
import {
  clearPendingGuestSave,
  getPendingGuestSave,
} from "@/lib/pendingGuestSave";

export function GuestTrialBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrateGuestMode = useGuestTrialStore((state) => state.hydrateGuestMode);
  const showGuestRestrictedNotice = useGuestTrialStore((state) => state.showGuestRestrictedNotice);
  const setNotice = useGuestTrialStore((state) => state.setNotice);

  useEffect(() => {
    hydrateGuestMode();
  }, [hydrateGuestMode]);

  // 비회원 때 만든 결과물을 로그인 후 기록에 자동 저장하던 자리다.
  //
  // 그 저장 경로가 백엔드에서 없어졌다 — 완성된 이미지를 등록하는 API 가 사라지고
  // (POST /api/auth/user/media → 405), 남은 것은 **원본 4장을 받아 서버가 그리는** 합성뿐이다.
  // 보류분은 이미 합쳐진 그림 한 장이라 그 입력이 될 수 없고, 원본 4장은 로그인 과정에서
  // 페이지가 다시 뜨며 사라진다(세션 스토어는 메모리에만 있다).
  //
  // 그래서 자동 저장을 시도하지 않는다. 예전에는 실패하면 pending 을 남겨 새로고침마다
  // 다시 시도했는데, 지금은 될 수 없는 시도라 **무한 재시도**가 된다 — 보류분을 정리하고
  // 내려받기를 안내한다. 백엔드에 완성본 등록 수단이 생기면 되살릴 것.
  const resumeHandledRef = useRef(false);
  useEffect(() => {
    if (!searchParams.get("resumeSave")) {
      // resumeSave가 사라지면 가드를 풀어, 같은 탭에서 이후의 또 다른 보류 저장도 처리되게 한다.
      resumeHandledRef.current = false;
      return;
    }
    if (resumeHandledRef.current) return;
    resumeHandledRef.current = true;

    const stripResumeParam = () => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("resumeSave");
      const nextSearch = nextParams.toString();
      router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
    };

    const pending = getPendingGuestSave();
    stripResumeParam();
    if (!pending) return;

    // 될 수 없는 저장이므로 보류분을 남겨 두지 않는다(남기면 새로고침마다 다시 시도한다).
    clearPendingGuestSave();
    setNotice({
      actions: [{ id: "dismiss", label: "닫기", variant: "secondary" }],
      eyebrow: "NOTICE",
      icon: "lock",
      message:
        "비회원 때 만든 네컷은 기록에 옮기지 못해요. 지금부터 찍는 네컷은 기록에 저장돼요.",
      title: "기록으로 옮기지 못했어요",
    });
  }, [pathname, router, searchParams, setNotice]);

  // guestNotice 쿼리를 만드는 곳은 proxy.ts의 게스트 리다이렉트 하나뿐이고 값도 "restricted"만 쓴다.
  // 공유/저장 안내는 URL이 아니라 화면에서 직접 스토어 액션을 부른다(shoot/result 등).
  useEffect(() => {
    const guestNotice = searchParams.get("guestNotice");
    if (!guestNotice) {
      return;
    }

    if (guestNotice === "restricted") {
      showGuestRestrictedNotice();
    }

    // 값이 무엇이든 파라미터는 걷어내 URL을 원래대로 되돌린다.
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("guestNotice");
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }, [pathname, router, searchParams, showGuestRestrictedNotice]);

  return <GuestTrialOverlay />;
}
