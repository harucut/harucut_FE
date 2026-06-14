"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Clock3, Home, User } from "lucide-react";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

type MobileTabBarProps = {
  // 공개 페이지(/pricing 등)에서 렌더될 때 true. 촬영 탭이 /shoot로 직행하면
  // proxy가 비회원을 /login으로 막으므로, 게스트 체험 안내를 띄워
  // enterGuestMode 후 /shoot로 이어지도록 한다. authed 페이지에서는 미지정.
  publicShoot?: boolean;
};

// 폰/태블릿(< lg)에서만 보이는 앱 스타일 하단 탭바 (handoff app TabBar: 홈·기록·촬영·MY).
// 데스크톱(≥ lg)에서는 숨기고 기존 웹 네비게이션을 사용한다.
export function MobileTabBar({ publicShoot = false }: MobileTabBarProps) {
  const pathname = usePathname();
  const showGuestTrialNotice = useGuestTrialStore(
    (state) => state.showGuestTrialNotice,
  );
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const shootButtonClass =
    "-mt-7 grid h-[54px] w-[54px] place-items-center rounded-full text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)]";

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[74px] items-center justify-around border-t border-[color:var(--hc-border)] bg-[color:var(--hc-card)] pb-2 backdrop-blur-xl lg:hidden"
    >
      <Link
        href="/home"
        aria-label="홈"
        className={`flex w-14 flex-col items-center gap-0.5 ${
          isActive("/home")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <Home className="h-[23px] w-[23px]" />
        <span className="text-[10.5px] font-medium">홈</span>
      </Link>

      <Link
        href="/history"
        aria-label="기록"
        className={`flex w-14 flex-col items-center gap-0.5 ${
          isActive("/history")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <Clock3 className="h-[23px] w-[23px]" />
        <span className="text-[10.5px] font-medium">기록</span>
      </Link>

      {publicShoot ? (
        <button
          type="button"
          aria-label="촬영"
          onClick={showGuestTrialNotice}
          className={shootButtonClass}
          style={{ background: "var(--hc-primary)" }}
        >
          <Camera className="h-[26px] w-[26px]" />
        </button>
      ) : (
        <Link
          href="/shoot"
          aria-label="촬영"
          className={shootButtonClass}
          style={{ background: "var(--hc-primary)" }}
        >
          <Camera className="h-[26px] w-[26px]" />
        </Link>
      )}

      <Link
        href="/mypage"
        aria-label="MY"
        className={`flex w-14 flex-col items-center gap-0.5 ${
          isActive("/mypage")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <User className="h-[23px] w-[23px]" />
        <span className="text-[10.5px] font-medium">MY</span>
      </Link>
    </nav>
  );
}
