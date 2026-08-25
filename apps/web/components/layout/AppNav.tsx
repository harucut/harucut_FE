"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/layout/BrandMark";

type AppNavProps = {
  // 프로필 원형에 표시할 사용자 이니셜(없으면 아이콘 대체).
  userInitial?: string | null;
};

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/home", label: "홈" },
  { href: "/history", label: "기록" },
  { href: "/theme", label: "프레임" },
  { href: "/pricing", label: "요금제" },
];

// 데스크톱(≥ lg) 전용 상단 네비게이션 (handoff app AppNav).
// 모바일(< lg)에서는 숨기고 하단 MobileTabBar가 네비게이션을 담당한다.
//
// 촬영 CTA는 여기 두지 않는다. 데스크톱 상단은 네비게이션 자리이고, 촬영 진입은 홈의
// 큰 카드가 맡는다. 모바일은 그대로 하단 탭바 가운데 FAB가 담당한다 — 이 컴포넌트는
// lg 미만에서 아예 렌더되지 않으므로 여기 변경은 모바일에 닿지 않는다.
export function AppNav({ userInitial }: AppNavProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const initial = userInitial?.trim()?.[0]?.toUpperCase() ?? "";

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
                /*
                  현재 위치는 바탕이 아니라 글자가 말한다.
                  알약 바탕(--hc-surface-highlight)이 헤더 위에 떠 있는 칩처럼 읽혀서,
                  "여기 있다"는 신호보다 그 도형 자체가 먼저 눈에 들어왔다. 라이트에서는
                  흰 알약이 거의 흰 헤더 위에 얹혀 그림자만 남는 것도 문제였다.

                  대신 이 시스템의 주된 위계 장치인 굵기 대비(800 ↔ 500)에 색을 얹는다.
                  hover 는 색만 올리고 굵기는 그대로 둔다 — 굵기를 같이 올리면 hover 가
                  활성과 구별되지 않고(예전엔 실제로 그랬다), 글자 폭이 변해 흔들린다.
                  초록은 쓰지 않는다. 이 화면의 초록은 촬영 CTA 와 프로필 원이 이미 갖고 있다.
                */
                className={`whitespace-nowrap px-3.5 py-2 text-[15px] transition ${
                  active
                    ? "font-extrabold text-[color:var(--hc-text)]"
                    : "font-medium text-[color:var(--hc-muted)] hover:text-[color:var(--hc-text)]"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
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
