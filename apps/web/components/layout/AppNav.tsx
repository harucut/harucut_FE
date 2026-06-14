"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Camera } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { useGuestTrialStore } from "@/lib/guestTrialStore";

type AppNavProps = {
  // 프로필 원형에 표시할 사용자 이니셜(없으면 아이콘 대체).
  userInitial?: string | null;
  // 공개 페이지(/pricing 등)에서 렌더될 때 true. 촬영 CTA가 /shoot로 직행하면
  // proxy가 비회원을 /login으로 막으므로, 게스트 체험 안내를 띄워
  // enterGuestMode 후 /shoot로 이어지도록 한다. authed 페이지에서는 미지정.
  publicShoot?: boolean;
};

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/home", label: "홈" },
  { href: "/history", label: "기록" },
  { href: "/theme", label: "프레임" },
  { href: "/pricing", label: "요금제" },
];

// 데스크톱(≥ lg) 전용 상단 네비게이션 (handoff app AppNav).
// 모바일(< lg)에서는 숨기고 하단 MobileTabBar가 네비게이션을 담당한다.
export function AppNav({ userInitial, publicShoot = false }: AppNavProps) {
  const pathname = usePathname();
  const showGuestTrialNotice = useGuestTrialStore(
    (state) => state.showGuestTrialNotice,
  );
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const initial = userInitial?.trim()?.[0]?.toUpperCase() ?? "";

  const shootButtonClass =
    "hc-button-primary flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-bold";

  return (
    <header className="sticky top-0 z-40 hidden border-b border-[color:var(--hc-border)] bg-[color:var(--hc-surface-soft)] backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-[68px] w-full max-w-5xl items-center gap-9 px-7">
        <BrandMark href="/home" />

        <nav className="flex gap-2">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[14.5px] font-bold transition ${
                  active
                    ? "bg-[color:var(--hc-surface-highlight)] text-[color:var(--hc-text)] shadow-sm"
                    : "text-[color:var(--hc-muted)] hover:text-[color:var(--hc-text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {publicShoot ? (
            <button
              type="button"
              onClick={showGuestTrialNotice}
              className={shootButtonClass}
            >
              <Camera className="h-[17px] w-[17px]" />
              촬영하기
            </button>
          ) : (
            <Link href="/shoot" className={shootButtonClass}>
              <Camera className="h-[17px] w-[17px]" />
              촬영하기
            </Link>
          )}

          <button
            type="button"
            aria-label="알림"
            className="hc-button-icon grid h-[42px] w-[42px] place-items-center rounded-full border text-[color:var(--hc-muted)] transition hover:text-[color:var(--hc-text)]"
          >
            <Bell className="h-[19px] w-[19px]" />
          </button>

          <Link
            href="/mypage"
            aria-label="마이페이지"
            className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[color:var(--hc-primary)] text-[15px] font-extrabold text-[color:var(--hc-primary-contrast)]"
          >
            {initial || "MY"}
          </Link>
        </div>
      </div>
    </header>
  );
}
