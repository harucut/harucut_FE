"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { useDarkStage } from "@/hooks/useDarkStage";

// 공개(마케팅) 페이지 공통 상단 네비 — 랜딩/요금제/FAQ가 각자 다른 헤더를 갖고 있어
// 높이·링크·CTA가 제각각이던 것을 하나로 통일한다.
// 마케팅 무대는 사용자 테마와 무관하게 딥다크 고정이다(globals.css .hc-stage-dark). 여기도 늘 그 위에 선다.

const NAV_LINKS = [
  { href: "/features", label: "기능" },
  { href: "/enterprise", label: "행사" },
  { href: "/pricing", label: "요금제" },
  { href: "/faq", label: "FAQ" },
] as const;

export const MARKETING_NAV_HEIGHT = 72;

export function MarketingNav({
  cta = "quiet",
  width = "max-w-[1160px]",
}: {
  /**
   * 우측 CTA 의 무게. 본문에 초록 CTA 가 없는 화면(랜딩·기능 — 히어로 버튼이 흰색)만 "primary".
   * 요금제·행사·FAQ·약관은 본문이 초록을 갖고 있어 "quiet"(중립 알약). 한 화면에 초록 CTA 는 하나다.
   */
  cta?: "primary" | "quiet";
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

  // 마케팅 무대는 사용자 테마와 무관하게 어둡다. 무대에 있는 동안 상태바·theme-color 도 다크.
  useDarkStage();

  // hover 색은 부분일치 매핑에 걸리지 않는 arbitrary 값으로 쓴다(예전 globals.css 의
  // `[class*="hover:bg-white"]` 규칙이 라이트 테마에서 흰 알약+흰 글자를 만들었다 — 규칙은 걷어냈다).
  // 데스크톱은 브랜드 줄에, 모바일은 그 아래 줄에 놓는다. 예전에는 모바일에서 그냥 숨겨서
  // 기능·요금제·FAQ 로 가는 길이 아예 없었다(햄버거도 없었다).
  // 좁은 화면에서는 링크 넷이 브랜드와 한 줄에 들어가야 하므로 가로 패딩을 줄인다.
  const linkBase =
    "inline-flex rounded-full px-2.5 py-2 text-[13px] font-semibold transition sm:px-4";
  const linkTone = "text-white hover:bg-[rgba(255,255,255,0.07)]";

  return (
    <header
      className="sticky top-0 z-40 transition-[background-color,border-color] duration-300"
      style={{
        background: scrolled ? "rgba(11,11,12,.82)" : "transparent",
        backdropFilter: scrolled ? "saturate(1.2) blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,.1)" : "transparent"}`,
      }}
    >
      <div
        className={`mx-auto flex h-[72px] w-full items-center justify-between px-7 ${width}`}
      >
        <BrandMark href="/" tone="light" />

        <div className="flex items-center gap-2.5">
          {/*
            모바일에서도 링크를 브랜드와 같은 줄에 둔다.

            예전에는 자리가 없어 아래 줄로 뺐는데, 그 바람에 헤더가 113px 이 돼 첫 화면의
            13% 를 내비가 먹었다. 자리를 만든 건 아래 CTA 를 숨긴 것이다 — 360px 기준
            브랜드 77 + 링크 211 = 288px 로 사용 가능 폭 304px 에 들어간다(CTA 를 넣으면 412px).
          */}
          <nav
            aria-label="사이트 메뉴"
            className="flex items-center gap-1 sm:gap-2.5"
          >
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`${linkBase} ${linkTone} ${
                    active ? "" : "opacity-80"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {/*
            우측 상단 CTA: 지금 시작하기 → /login(로그인 우선). 가입·비회원 체험은
            로그인 페이지에서.

            본문에 초록 CTA 가 있는 화면(요금제·행사·FAQ·약관)은 quiet(중립 알약), 히어로 CTA 가
            흰색인 랜딩·기능만 primary — 어느 쪽이든 한 화면에 초록 CTA 는 하나다.

            모바일에서는 숨긴다. 히어로 바로 아래에 CTA 두 개가 이미 있어 첫 화면에 같은
            행동이 세 번 놓였고(그중 둘은 목적지가 /login 으로 같다), 초록도 브랜드·이 버튼·
            헤드라인 세 곳에 흩어져 "강조는 한 화면에 하나"가 깨졌다. 좁은 화면에서 자리를
            차지할 값을 못 한다.
          */}
          <Link
            href="/login"
            className={
              cta === "primary"
                ? "hc-button-primary hidden items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold sm:inline-flex"
                : "hc-button-secondary hidden items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold sm:inline-flex"
            }
          >
            지금 시작하기 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
