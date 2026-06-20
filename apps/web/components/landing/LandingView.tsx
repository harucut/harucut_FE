"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { FramePreview } from "@/components/frame/FramePreview";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import type { FrameId } from "@/constants/frames";
import { PLANS } from "@/constants/plans";

// STUDIO 마케팅 스테이지는 딥다크 고정(핸드오프 디자인 그대로).
const GREEN = "#1ED760";

const HERO_IMAGES = Array.from({ length: 4 }, () => "/hero-image.png");

const STEPS = [
  { n: "01", k: "SHOOT", t: "촬영하기", d: "카메라로 8장을 찍거나, 갤러리에서 골라요." },
  { n: "02", k: "DECORATE", t: "꾸미기", d: "프레임·텍스트·스티커로 나만의 네 컷을 완성해요." },
  { n: "03", k: "KEEP", t: "기록하기", d: "사진과 영상으로 저장하고, 기록에 차곡차곡 모아요." },
] as const;

const FRAMES: { id: FrameId; name: string; border: string }[] = [
  { id: "classic-4", name: "클래식", border: "#000000" },
  { id: "wide-4", name: "와이드", border: "#18181A" },
  { id: "grid-4", name: "2×2 그리드", border: GREEN },
  { id: "polaroid-4", name: "폴라로이드", border: "#FAFAF7" },
];

const FAQ_ITEMS: [string, string][] = [
  [
    "비회원도 사용할 수 있나요?",
    "네, 가입 없이도 촬영과 꾸미기를 바로 체험할 수 있어요. 다만 결과물 다운로드·저장, 영상 생성, 기록 보관은 무료 가입(BASIC) 후 이용할 수 있어요.",
  ],
  [
    "촬영은 어떻게 하나요? 꼭 카메라가 있어야 하나요?",
    "브라우저나 앱 카메라로 8장을 찍고 마음에 드는 4장을 고르면 돼요. 카메라가 없거나 이미 찍어둔 사진이 있다면 갤러리에서 업로드해 네 컷을 만들 수도 있어요.",
  ],
  [
    "사진 말고 영상도 만들어지나요?",
    "네. 네 컷을 완성하면 사진과 함께 짧은 영상 버전도 만들어져요. 영상 생성 횟수는 플랜에 따라 달라요 (BASIC 월 5회 · PLUS 월 30회 · PRO 무제한).",
  ],
  [
    "프레임을 직접 꾸밀 수 있나요?",
    "네. 프레임 색과 배경 이미지를 고르고 텍스트·스티커를 올려 위치·회전까지 직접 편집할 수 있어요. 직접 만든 프레임은 저장해두고 다음 촬영에 다시 쓸 수 있어요.",
  ],
  [
    "내 사진은 안전하게 보관되나요? 다른 사람에게 공개되나요?",
    "내 기록은 기본적으로 비공개예요. 모두에게 노출되는 공개 피드는 없고, 공유는 내가 직접 링크를 보낼 때만 이뤄져요.",
  ],
  [
    "워터마크 없이 저장할 수 있나요?",
    "PLUS·PRO 플랜에서는 워터마크 없이 원본 화질로 저장할 수 있어요. 무료 BASIC은 결과물에 워터마크가 포함돼요.",
  ],
  [
    "로그인은 어떻게 하나요?",
    "이메일로 가입하거나 카카오·네이버 같은 소셜 계정으로 간편하게 시작할 수 있어요.",
  ],
  [
    "휴대폰에서도 쓸 수 있나요? 앱이 따로 있나요?",
    "웹은 휴대폰·태블릿에서 앱처럼 보이도록 반응형으로 동작하고, 안드로이드 전용 앱도 제공해요.",
  ],
];

const FOOTER_COLS: { title: string; items: { label: string; href?: string }[] }[] = [
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
          단일 페이지라 섹션 점프용 nav(서비스/프레임)는 제거 — 헤더는 로고 + CTA만.
          모바일·태블릿(<lg)에선 CTA도 숨겨 앱 온보딩처럼 로고만 두고, CTA는 히어로 하단으로 내린다.
        */}
        <div className="hidden items-center gap-2.5 lg:flex">
          {/*
            hover:bg-white/[0.07] (not bg-white/5): globals.css의 테마 매핑 규칙
            [class*="bg-white/5"]가 부분 문자열 매칭이라 hover:bg-white/5까지 상시 적용해버려
            라이트 시스템 테마에서 로그인 버튼이 흰 알약(글자 안 보임)으로 굳던 문제를 피한다.
          */}
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/[0.07]"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="rounded-full px-4 py-2 text-[13px] font-bold"
            style={{ background: GREEN, color: "#06140A" }}
          >
            무료로 시작하기
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

function FaqList() {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col">
      {FAQ_ITEMS.map(([q, a], i) => {
        const on = open === i;
        return (
          <div key={q} className="border-t border-white/10">
            <button
              type="button"
              onClick={() => setOpen(on ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-1 py-5 text-left"
            >
              <span className="text-[17px] font-bold tracking-tight text-white">{q}</span>
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/20 text-[#B3B3B3] transition-transform"
                style={{ transform: on ? "rotate(45deg)" : "none" }}
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </button>
            {on ? (
              <p className="mb-5 mt-0 max-w-[680px] px-1 text-[15px] leading-[1.65] text-[#B3B3B3]">
                {a}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="border-t border-white/10" />
    </div>
  );
}

export function LandingView() {
  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-white">
      <WebNav />

      {/*
        HERO — 데스크톱(lg+)은 좌측 텍스트 / 우측 콜라주의 2열 마케팅 히어로.
        모바일·태블릿(<lg)은 앱 온보딩 화면과 1:1로 맞춘다: 한 화면을 꽉 채우고
        상단에 프레임 콜라주, 하단에 타이틀·본문·풀폭 버튼(로그인 우선)을 둔다.
      */}
      <section className="mx-auto flex min-h-[calc(100svh-72px)] max-w-[1160px] flex-col px-7 pb-10 pt-4 lg:grid lg:min-h-0 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-10 lg:pb-16 lg:pt-10">
        {/* 텍스트·버튼 — 모바일은 하단(order-2)·중앙 정렬 폭 제한, 데스크톱은 좌측 열에서 살짝 위로 */}
        <div className="order-2 mx-auto w-full max-w-[460px] lg:order-none lg:mx-0 lg:max-w-none lg:-translate-y-4">
          <h1 className="text-[34px] font-extrabold leading-[1.12] tracking-[-1.5px] sm:text-[44px] lg:mt-2 lg:text-[58px] lg:tracking-[-2px]">
            어디서든,
            <br />
            <span style={{ color: GREEN }}>하루를 촬영해요</span>
          </h1>
          <p className="mb-6 mt-4 max-w-[430px] text-[15px] leading-[1.6] text-[#B3B3B3] sm:text-[17px] lg:mb-7 lg:mt-5 lg:leading-[1.65]">
            특별한 하루를 사진으로 남겨보세요.
          </p>
          {/* 모바일·태블릿: 앱 온보딩처럼 풀폭 스택 (1차 CTA = 무료로 시작하기) */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            <Link
              href="/signup"
              className="flex w-full items-center justify-center rounded-full px-7 py-3.5 text-[16px] font-bold"
              style={{ background: GREEN, color: "#06140A" }}
            >
              무료로 시작하기
            </Link>
            <GuestTrialStartButton className="flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-3.5 text-[16px] font-bold text-white transition-colors hover:border-white">
              체험하기
            </GuestTrialStartButton>
          </div>
          {/* 데스크톱: 기존 마케팅 CTA(무료로 시작하기 우선) */}
          <div className="hidden flex-wrap gap-3 lg:flex">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[16px] font-bold"
              style={{ background: GREEN, color: "#06140A" }}
            >
              무료로 시작하기 <ArrowRight className="h-[19px] w-[19px]" />
            </Link>
            <GuestTrialStartButton className="inline-flex items-center rounded-full border border-white/20 px-6 py-3.5 text-[16px] font-bold text-white transition-colors hover:border-white">
              체험하기
            </GuestTrialStartButton>
          </div>
        </div>

        {/* 프레임 콜라주 — 모바일은 상단(order-1)에서 남는 공간을 채우며 중앙 부유, 데스크톱은 우측 열 */}
        <div className="relative order-1 flex min-h-0 flex-1 items-start justify-center overflow-hidden pt-3 lg:order-none lg:h-[480px] lg:flex-none lg:items-center lg:translate-y-7 lg:pt-0">
          <div
            className="-mr-5 h-[180px] drop-shadow-2xl sm:-mr-6 sm:h-[260px]"
            style={{
              transform: "rotate(-8deg) translateY(8px) translateZ(0)",
              zIndex: 1,
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <ShowcaseFrame id="classic-4" className="!h-full !w-auto" />
          </div>
          <div
            className="h-[220px] drop-shadow-2xl sm:h-[320px]"
            style={{
              transform: "rotate(3deg) translateZ(0)",
              zIndex: 3,
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <ShowcaseFrame id="grid-4" className="!h-full !w-auto" />
          </div>
          <div
            className="-ml-5 h-[180px] drop-shadow-2xl sm:-ml-6 sm:h-[260px]"
            style={{
              transform: "rotate(9deg) translateY(8px) translateZ(0)",
              zIndex: 2,
              backfaceVisibility: "hidden",
              willChange: "transform",
            }}
          >
            <ShowcaseFrame id="polaroid-4" className="!h-full !w-auto" />
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="border-y border-white/10 bg-black">
        <div className="mx-auto max-w-[1160px] px-7 py-[76px]">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs tracking-[3px]" style={{ color: GREEN }}>
                ● REC · 사용법
              </span>
              <h2 className="mt-3.5 text-[40px] font-extrabold leading-[1.05] tracking-[-1.4px]">
                찍고 — 꾸미고 — 남기고.
                <br />네 컷이면 끝.
              </h2>
            </div>
            <span className="font-mono text-xs text-white/40">00:03 / 00:08</span>
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
          <span className="font-mono text-xs tracking-[3px]" style={{ color: GREEN }}>
            FRAMES · 프레임
          </span>
          <h2 className="mt-3 text-[38px] font-extrabold tracking-[-1.2px]">
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

      {/* PRICING */}
      <section className="border-y border-white/10 bg-[#18181A]">
        <div className="mx-auto max-w-[1160px] px-7 py-20">
          <div className="mb-9">
            <span className="font-mono text-xs tracking-[3px]" style={{ color: GREEN }}>
              PRICING · 요금제
            </span>
            <h2 className="mt-3 text-[38px] font-extrabold tracking-[-1.2px]">
              비회원도 촬영은 무료
            </h2>
          </div>
          <div className="grid items-stretch gap-[18px] md:grid-cols-3">
            {PLANS.map((p) => {
              const hot = p.hot;
              return (
                <div
                  key={p.id}
                  className="flex flex-col rounded-[18px] px-[26px] py-7"
                  style={{
                    background: hot ? GREEN : "transparent",
                    border: hot ? "none" : "1px solid rgba(255,255,255,.1)",
                    boxShadow: hot ? "0 24px 50px -24px rgba(30,215,96,.5)" : "none",
                  }}
                >
                  <div className="flex min-h-[22px] items-center justify-between">
                    <span
                      className="text-[15px] font-extrabold tracking-[.4px]"
                      style={{ color: hot ? "#06140A" : "#fff" }}
                    >
                      {p.name}
                    </span>
                    {p.badge ? (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                        style={{ background: "#06140A", color: GREEN }}
                      >
                        {p.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="mb-5 mt-[18px] flex items-baseline gap-1.5">
                    <span
                      className="text-[32px] font-extrabold leading-[.9] tracking-[-1.2px]"
                      style={{ color: hot ? "#06140A" : "#fff" }}
                    >
                      {p.price}
                    </span>
                    <span
                      className="font-mono text-[13px]"
                      style={{ color: hot ? "rgba(6,20,10,.62)" : "#6F6F73" }}
                    >
                      {p.sub}
                    </span>
                  </div>
                  <div
                    className="mb-[22px] h-px w-full"
                    style={{ background: hot ? "rgba(6,20,10,.14)" : "rgba(255,255,255,.1)" }}
                  />
                  <div className="mb-[26px] flex flex-col gap-3">
                    {p.feats.map(([label, on, note]) => (
                      <div
                        key={label}
                        className="flex items-start gap-2.5"
                        style={{ opacity: on ? 1 : 0.45 }}
                      >
                        <span
                          className="mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[11px] font-bold"
                          style={{
                            background: !on
                              ? "transparent"
                              : hot
                                ? "rgba(6,20,10,.12)"
                                : "rgba(30,215,96,.16)",
                            border: on
                              ? "none"
                              : `1.5px solid ${hot ? "rgba(6,20,10,.32)" : "rgba(255,255,255,.28)"}`,
                            color: hot ? "#06140A" : GREEN,
                          }}
                        >
                          {on ? "✓" : "×"}
                        </span>
                        <span
                          className="text-[13.5px] leading-[1.4]"
                          style={{ color: hot ? "#06140A" : "#fff" }}
                        >
                          {label}
                          {note ? (
                            <b
                              className="font-bold"
                              style={{
                                color: hot
                                  ? "rgba(6,20,10,.82)"
                                  : on
                                    ? "#fff"
                                    : "#B3B3B3",
                              }}
                            >
                              {" · "}
                              {note}
                            </b>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={p.id === "basic" ? "/signup" : "/login"}
                    className="mt-auto flex h-[50px] w-full items-center justify-center rounded-full text-[14.5px] font-extrabold transition-transform hover:scale-[1.025]"
                    style={{
                      background: hot ? "#06140A" : "transparent",
                      color: hot ? GREEN : "#fff",
                      border: hot ? "none" : "1px solid rgba(255,255,255,.18)",
                    }}
                  >
                    {p.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px] px-7 py-20">
        <h2 className="mb-8 text-[36px] font-extrabold tracking-[-1px]">
          자주 묻는 <span style={{ color: GREEN }}>질문들</span>
        </h2>
        <FaqList />
      </section>

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
            무료로 시작하기 <ArrowRight className="h-[19px] w-[19px]" />
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
          <div className="mx-auto flex max-w-[1160px] justify-between px-7 py-[18px]">
            <span className="font-mono text-[11px] text-[#6F6F73]">© 2026 Harucut</span>
            <span className="font-mono text-[11px] text-[#6F6F73]">harucut.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
