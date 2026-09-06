"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Camera, Film, Home, LayoutGrid, User } from "lucide-react";
import { RecordSourceDialog } from "@/components/shoot/RecordSourceDialog";
import { usePublicShootCta } from "@/lib/usePublicShootCta";

type MobileTabBarProps = {
  // 공개 페이지(/pricing 등)에서 렌더될 때 true. 촬영 탭은 인증 여부를 확인해
  // 로그인 사용자는 /shoot로 직행, 비회원은 게스트 체험 안내를 띄운다.
  // (proxy가 비회원을 /login으로 막으므로) authed 페이지에서는 미지정.
  publicShoot?: boolean;
};

// 폰/태블릿(< lg)에서만 보이는 앱 스타일 하단 탭바
// (handoff app TabBar: 홈·기록·촬영(FAB)·프레임·MY 5탭).
// 데스크톱(≥ lg)에서는 숨기고 기존 웹 네비게이션을 사용한다.
export function MobileTabBar({ publicShoot = false }: MobileTabBarProps) {
  const pathname = usePathname();
  const { onShootCta } = usePublicShootCta();
  // 가운데 버튼도 홈 카드와 **같은 것**을 연다. 하나는 고르라고 하고 하나는 바로
  // 카메라로 가면, 같아 보이는 두 진입로가 다르게 동작한다.
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const shootButtonClass =
    "-mt-7 grid h-[54px] w-[54px] place-items-center rounded-full text-[color:var(--hc-primary-contrast)] shadow-[var(--hc-button-shadow)] transition active:brightness-90";

  return (
    <>
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[74px] items-center justify-around border-t border-[color:var(--hc-border)] bg-[color:var(--hc-card)] pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
    >
      <Link
        href="/home"
        aria-label="홈"
        aria-current={isActive("/home") ? "page" : undefined}
        className={`flex min-h-[48px] w-14 flex-col items-center justify-center gap-0.5 transition active:opacity-60 ${
          isActive("/home")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <Home className="h-[23px] w-[23px]" />
        <span className="text-[11px] font-medium">홈</span>
      </Link>

      <Link
        href="/history"
        aria-label="기록"
        aria-current={isActive("/history") ? "page" : undefined}
        className={`flex min-h-[48px] w-14 flex-col items-center justify-center gap-0.5 transition active:opacity-60 ${
          isActive("/history")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <LayoutGrid className="h-[23px] w-[23px]" />
        <span className="text-[11px] font-medium">기록</span>
      </Link>

      {publicShoot ? (
        <button
          type="button"
          aria-label="촬영"
          onClick={onShootCta}
          className={shootButtonClass}
          style={{ background: "var(--hc-primary)" }}
        >
          <Camera className="h-[26px] w-[26px]" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="기록 남기기"
          onClick={() => setSourceDialogOpen(true)}
          className={shootButtonClass}
          style={{ background: "var(--hc-primary)" }}
        >
          <Camera className="h-[26px] w-[26px]" />
        </button>
      )}

      <Link
        href="/theme"
        aria-label="프레임"
        aria-current={isActive("/theme") ? "page" : undefined}
        className={`flex min-h-[48px] w-14 flex-col items-center justify-center gap-0.5 transition active:opacity-60 ${
          isActive("/theme")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <Film className="h-[23px] w-[23px]" />
        <span className="text-[11px] font-medium">프레임</span>
      </Link>

      <Link
        href="/mypage"
        aria-label="MY"
        aria-current={isActive("/mypage") ? "page" : undefined}
        className={`flex min-h-[48px] w-14 flex-col items-center justify-center gap-0.5 transition active:opacity-60 ${
          isActive("/mypage")
            ? "text-[color:var(--hc-text)]"
            : "text-[color:var(--hc-muted)]"
        }`}
      >
        <User className="h-[23px] w-[23px]" />
        <span className="text-[11px] font-medium">MY</span>
      </Link>
    </nav>
    <RecordSourceDialog
      open={sourceDialogOpen}
      onClose={() => setSourceDialogOpen(false)}
    />
    </>
  );
}
