"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { FramePreview } from "@/components/frame/FramePreview";
import type { FrameId } from "@/constants/frames";
import { COMPANY } from "@/constants/company";

// STUDIO 마케팅 스테이지는 딥다크 고정(핸드오프 디자인 그대로).
const GREEN = "#1ED760";

const HERO_IMAGES = Array.from({ length: 4 }, () => "/hero-image.png");

const STEPS = [
  { n: "01", k: "SHOOT", t: "촬영하기", d: "카메라로 8장을 찍거나, 갤러리에서 골라요." },
  { n: "02", k: "DECORATE", t: "꾸미기", d: "프레임·텍스트·스티커로 나만의 네 컷을 완성해요." },
  { n: "03", k: "KEEP", t: "기록하기", d: "사진으로 저장하고, 기록에 차곡차곡 모아요." },
] as const;

const FRAMES: { id: FrameId; name: string; border: string }[] = [
  { id: "classic-4", name: "클래식", border: "#000000" },
  { id: "wide-4", name: "와이드", border: "#18181A" },
  { id: "grid-4", name: "2×2 그리드", border: GREEN },
  { id: "polaroid-4", name: "폴라로이드", border: "#FAFAF7" },
];

// FAQ는 constants/faq.ts(단일 소스)로 이동 — 랜딩은 LANDING_FAQ(상위 5개)만, 전체는 /faq.

const FOOTER_COLS: { title: string; items: { label: string; href?: string }[] }[] = [
  {
    title: "바로가기",
    items: [
      { label: "요금제", href: "/pricing" },
      { label: "자주 묻는 질문", href: "/faq" },
    ],
  },
  {
    title: "정책",
    items: [
      { label: "이용약관", href: "/terms" },
      { label: "개인정보 처리방침", href: "/privacy" },
    ],
  },
];

function WebNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // passive 리스너로 등록해 스크롤 중 브라우저가 핸들러의 preventDefault 여부를
    // 기다리지 않도록 한다(스크롤 부드러움 향상). 마운트 시 현재 위치도 한 번 동기화한다.
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(11,11,12,.82)" : "transparent",
        backdropFilter: scrolled ? "saturate(1.2) blur(14px)" : "none",
        borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,.1)" : "transparent"}`,
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-[1160px] items-center justify-between px-7">
        <BrandMark href="/" tone="light" />
        {/*
          헤더는 로고 + CTA만. 히어로엔 버튼을 두지 않으므로(브랜드 비주얼만) primary CTA
          (지금 시작하기)는 모바일에도 노출해 첫 화면에서 항상 진입 가능하게 한다. 요금제는 데스크톱만.
        */}
        <div className="flex items-center gap-2.5">
          {/*
            hover:bg-white/[0.07] (not bg-white/5): globals.css의 테마 매핑 규칙
            [class*="bg-white/5"]가 부분 문자열 매칭이라 hover:bg-white/5까지 상시 적용해버려
            라이트 시스템 테마에서 로그인 버튼이 흰 알약(글자 안 보임)으로 굳던 문제를 피한다.
          */}
          <Link
            href="/pricing"
            className="hidden rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.07] lg:inline-flex"
          >
            요금제
          </Link>
          <Link
            href="/faq"
            className="hidden rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.07] lg:inline-flex"
          >
            FAQ
          </Link>
          {/* 우측 상단 primary CTA: 지금 시작하기 → /login(로그인 우선). 가입·비회원 체험은 로그인 페이지에서. */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold"
            style={{ background: GREEN, color: "#06140A" }}
          >
            지금 시작하기 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function ShowcaseFrame({
  id,
  className = "",
}: {
  id: FrameId;
  className?: string;
}) {
  return (
    <FramePreview
      frameId={id}
      images={HERO_IMAGES}
      borderColor="#0B0B0C"
      className={className}
    />
  );
}

// FAQ 목록은 /faq 전용 페이지로 분리 — 랜딩 인라인 FAQ는 제거(접근은 nav·푸터 링크).

// 히어로 — 에디토리얼/타입 우선: 초대형 Pretendard Black 헤드라인 +
// 그린 글로우 + 하단에 흩뿌린 폴라로이드 콜라주(편집 디자인 느낌, 템플릿 탈피).
function HeroEditorial() {
  return (
    <section className="relative mx-auto flex min-h-[calc(100svh-72px)] max-w-[1160px] flex-col items-center justify-center overflow-hidden px-7 pb-16 pt-10 text-center">
      {/* 배경 그린 글로우 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[22%] h-[440px] w-[640px] -translate-x-1/2 rounded-full opacity-20 blur-[100px]"
        style={{ background: GREEN }}
      />

      {/* 헤드라인 — Pretendard Black, 초대형(type-first) */}
      <h1 className="relative text-[46px] font-black leading-[1.02] tracking-[-2.4px] sm:text-[68px] lg:text-[88px] lg:tracking-[-4px]">
        어디서든,
        <br />
        하루를 <span style={{ color: GREEN }}>촬영해요</span>
      </h1>
      <p className="relative mb-9 mt-6 max-w-[440px] text-[16px] leading-[1.6] text-[#B3B3B3] sm:text-[18px]">
        특별한 하루를 사진으로 남겨보세요.
      </p>

      {/* 히어로는 브랜드 비주얼만 — CTA(지금 시작하기)는 헤더 우측 상단이 담당한다. */}

      {/* 흩뿌린 폴라로이드 콜라주 — 하단 마감 */}
      <div className="relative mt-14 flex w-full items-end justify-center">
        <div
          className="-mr-7 h-[120px] drop-shadow-2xl sm:h-[150px]"
          style={{ transform: "rotate(-12deg) translateY(10px)", zIndex: 1 }}
        >
          <ShowcaseFrame id="classic-4" className="!h-full !w-auto" />
        </div>
        <div
          className="h-[150px] drop-shadow-2xl sm:h-[185px]"
          style={{ transform: "rotate(3deg)", zIndex: 3 }}
        >
          <ShowcaseFrame id="grid-4" className="!h-full !w-auto" />
        </div>
        <div
          className="-ml-7 h-[120px] drop-shadow-2xl sm:h-[150px]"
          style={{ transform: "rotate(12deg) translateY(10px)", zIndex: 2 }}
        >
          <ShowcaseFrame id="polaroid-4" className="!h-full !w-auto" />
        </div>
      </div>
    </section>
  );
}

export function LandingView() {
  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-white">
      <WebNav />

      <HeroEditorial />

      {/* HOW */}
      <section id="how" className="border-y border-white/10 bg-black">
        <div className="mx-auto max-w-[1160px] px-7 py-[76px]">
          <div className="mb-10">
            <h2 className="text-[40px] font-extrabold leading-[1.05] tracking-[-1.4px]">
              찍고 — 꾸미고 — 남기고.
              <br />네 컷이면 끝.
            </h2>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0E0E0F]">
            <div className="h-[18px] border-b border-white/[0.06] bg-[repeating-linear-gradient(90deg,transparent_0_12px,rgba(255,255,255,.07)_12px_22px)]" />
            <div className="grid md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className="relative px-[30px] pb-[38px] pt-[34px]"
                  style={{ borderLeft: i ? "1px dashed rgba(255,255,255,.12)" : "none" }}
                >
                  <div className="mb-[18px] flex items-baseline gap-3">
                    <span
                      className="font-mono text-[58px] font-extrabold leading-[.8] tracking-[-3px]"
                      style={{ color: i === 0 ? GREEN : "rgba(255,255,255,.16)" }}
                    >
                      {s.n}
                    </span>
                    <span
                      className="font-mono text-[11px] tracking-[2px]"
                      style={{ color: i === 0 ? GREEN : "rgba(255,255,255,.45)" }}
                    >
                      {s.k}
                    </span>
                  </div>
                  <h3 className="mb-2 text-[22px] font-extrabold tracking-[-.4px] text-white">
                    {s.t}
                  </h3>
                  <p className="text-[14.5px] leading-[1.65] text-white/60">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="h-[18px] border-t border-white/[0.06] bg-[repeating-linear-gradient(90deg,transparent_0_12px,rgba(255,255,255,.07)_12px_22px)]" />
          </div>
        </div>
      </section>

      {/* FRAMES */}
      <section id="frames" className="mx-auto max-w-[1160px] px-7 py-20">
        <div className="mb-11">
          <h2 className="text-[38px] font-extrabold tracking-[-1.2px]">
            하루의 기분대로, <span style={{ color: GREEN }}>네 가지 프레임</span>
          </h2>
        </div>
        <div className="flex flex-wrap items-end justify-center gap-9">
          {FRAMES.map((f, i) => (
            <div key={f.id} className="text-center">
              <div
                className="inline-block drop-shadow-2xl"
                style={{
                  transform: `rotate(${(i - 1.5) * 2}deg) translateZ(0)`,
                  backfaceVisibility: "hidden",
                  willChange: "transform",
                }}
              >
                <div className={f.id === "wide-4" ? "w-[240px]" : "h-[210px]"}>
                  <ShowcaseFrame
                    id={f.id}
                    className={f.id === "wide-4" ? "!w-full" : "!h-full !w-auto"}
                  />
                </div>
              </div>
              <h4 className="mb-1 mt-5 text-[17px] font-extrabold">{f.name}</h4>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ는 /faq 전용 페이지로 분리 — 랜딩에선 헤더 nav·푸터 링크로만 접근. */}

      {/* CTA */}
      <section className="mx-auto max-w-[1160px] px-7 pb-[90px] pt-5">
        <div
          className="flex flex-wrap items-center justify-between gap-5 rounded-3xl px-10 py-9"
          style={{ background: GREEN }}
        >
          <h2 className="text-[30px] font-extrabold tracking-[-1px]" style={{ color: "#06140A" }}>
            하루를 네 컷으로 남겨볼까요?
          </h2>
          <Link
            href="/signup"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-[30px] py-3.5 text-[16px] font-bold text-[#0B0B0C] hover:bg-zinc-100"
          >
            시작하기 <ArrowRight className="h-[19px] w-[19px]" />
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#161617]">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-8 px-7 pb-10 pt-12">
          <div className="max-w-[280px]">
            <BrandMark href="/" tone="light" />
            <p className="mt-3.5 text-[13px] leading-[1.6] text-[#6F6F73]">
              온라인 인생네컷 서비스.
              <br />
              하루를 네 컷으로 남기세요.
            </p>
            <a
              href={`mailto:${COMPANY.email}`}
              className="mt-3 inline-block text-[13px] text-[#B3B3B3] hover:text-white"
            >
              고객문의 {COMPANY.email}
            </a>
          </div>
          <div className="flex flex-wrap gap-14">
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h6 className="mb-3.5 text-[13px] font-extrabold tracking-[.3px]">{col.title}</h6>
                {col.items.map((it) =>
                  it.href ? (
                    <Link
                      key={it.label}
                      href={it.href}
                      className="mb-2.5 block text-[13.5px] text-[#B3B3B3] hover:text-white"
                    >
                      {it.label}
                    </Link>
                  ) : (
                    <span key={it.label} className="mb-2.5 block text-[13.5px] text-[#B3B3B3]">
                      {it.label}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-2 px-7 py-[18px] font-mono text-[11px] leading-[1.7] text-[#6F6F73]">
            <p>
              {COMPANY.name} · 대표 {COMPANY.owner} · 사업자등록번호{" "}
              {COMPANY.bizRegNo} · 통신판매업신고번호 {COMPANY.mailOrderNo}
            </p>
            <p>{COMPANY.address}</p>
            <div className="flex justify-between">
              <span>© 2026 {COMPANY.name}</span>
              <span>harucut.com</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
