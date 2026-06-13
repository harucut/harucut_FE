"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Clock3, Home, User } from "lucide-react";

// 폰/태블릿(< lg)에서만 보이는 앱 스타일 하단 탭바 (handoff app TabBar: 홈·기록·촬영·MY).
// 데스크톱(≥ lg)에서는 숨기고 기존 웹 네비게이션을 사용한다.
export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

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

      <Link
        href="/shoot"
        aria-label="촬영"
        className="-mt-7 grid h-[54px] w-[54px] place-items-center rounded-full text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)]"
        style={{ background: "var(--hc-primary)" }}
      >
        <Camera className="h-[26px] w-[26px]" />
      </Link>

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
