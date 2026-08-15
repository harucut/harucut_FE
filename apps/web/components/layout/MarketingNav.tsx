"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";

// 공개(마케팅) 페이지 공통 상단 네비 — 랜딩/요금제/FAQ가 각자 다른 헤더를 갖고 있어
// 높이·링크·CTA가 제각각이던 것을 하나로 통일한다.
// tone="dark"는 테마와 무관하게 딥다크로 고정된 무대(랜딩 히어로) 위에서 쓴다.
const GREEN = "#1ED760";

const NAV_LINKS = [
  { href: "/features", label: "기능" },
  { href: "/pricing", label: "요금제" },
  { href: "/faq", label: "FAQ" },
] as const;

export const MARKETING_NAV_HEIGHT = 72;

export function MarketingNav({
  tone = "auto",
  width = "max-w-[1160px]",
}: {
  tone?: "auto" | "dark";
  /** 페이지 본문 컨테이너와 좌변을 맞추기 위한 폭. 요금제는 AppNav(max-w-5xl)와 같은 폭을 쓴다. */
  width?: string;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // passive 리스너로 등록해 스크롤 중 브라우저가 핸들러의 preventDefault 여부를
    // 기다리지 않도록 한다(스크롤 부드러움 향상). 마운트 시 현재 위치도 한 번 동기화한다.
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dark = tone === "dark";

  /*
    hover:bg-white/[0.07] (not bg-white/5): globals.css의 테마 매핑 규칙
    [class*="bg-white/5"]가 부분 문자열 매칭이라 hover:bg-white/5까지 상시 적용해버려
    라이트 시스템 테마에서 버튼이 흰 알약(글자 안 보임)으로 굳던 문제를 피한다.
  */
  // 데스크톱은 브랜드 줄에, 모바일은 그 아래 줄에 놓는다. 예전에는 모바일에서 그냥 숨겨서
  // 기능·요금제·FAQ 로 가는 길이 아예 없었다(햄버거도 없었다).
  const linkBase =
    "inline-flex rounded-full px-4 py-2 text-[13px] font-semibold transition";
  const linkTone = dark
    ? "text-white hover:bg-white/[0.07]"
    : "text-[color:var(--hc-text)] hover:bg-[color:var(--hc-surface-highlight)]";

  return (
    <header
      className="sticky top-0 z-40 transition-all duration-300"
      style={{
        background: scrolled
          ? dark
            ? "rgba(11,11,12,.82)"
            : "var(--hc-surface-soft)"
          : "transparent",
        backdropFilter: scrolled ? "saturate(1.2) blur(14px)" : "none",
        borderBottom: `1px solid ${
          scrolled
            ? dark
              ? "rgba(255,255,255,.1)"
              : "var(--hc-border)"
            : "transparent"
        }`,
      }}
    >
      <div
        className={`mx-auto flex h-[72px] w-full items-center justify-between px-7 ${width}`}
      >
        <BrandMark href="/" tone={dark ? "light" : undefined} />

        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2.5 sm:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`${linkBase} ${linkTone} ${
                  active ? "" : dark ? "opacity-80" : "opacity-70"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          </div>
          {/* 우측 상단 primary CTA: 지금 시작하기 → /login(로그인 우선). 가입·비회원 체험은 로그인 페이지에서. */}
          <Link
            href="/login"
            className={
              dark
                ? "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold"
                : "hc-button-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold"
            }
            style={dark ? { background: GREEN, color: "#06140A" } : undefined}
          >
            지금 시작하기 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 모바일 전용 보조 내비. 브랜드 줄에 넣을 자리가 없어 아래 줄로 뺀다. */}
      <nav
        aria-label="사이트 메뉴"
        className="flex items-center gap-1 overflow-x-auto px-7 pb-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${linkTone} ${
                active ? "" : dark ? "opacity-80" : "opacity-70"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
