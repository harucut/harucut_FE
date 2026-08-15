"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { DEMO_DECORATED_THEME } from "@/constants/demoTheme";
import { FramePreview } from "@/components/frame/FramePreview";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { Reveal } from "@/components/ui/Reveal";
import { TapeStrip } from "@/components/ui/TapeStrip";
import type { FrameId } from "@/constants/frames";

// STUDIO 마케팅 스테이지는 딥다크 고정(핸드오프 디자인 그대로).
const GREEN = "#1ED760";

const HERO_IMAGES = Array.from({ length: 4 }, () => "/hero-image.png");

// 02는 바로 아래 CUSTOM FRAME 섹션이 자세히 다루므로 여기선 한 줄만 걸어둔다.
const STEPS = [
  { n: "01", t: "촬영하기", d: "카메라로 8장을 찍거나, 갤러리에서 골라요." },
  { n: "02", t: "꾸미기", d: "프레임 위에 스티커와 글씨를 얹어요." },
  { n: "03", t: "기록하기", d: "사진으로 저장하고, 기록에 차곡차곡 모아요." },
] as const;

// FAQ는 /faq 전용 페이지가 단독으로 맡는다 — 랜딩에 인라인 FAQ는 두지 않고,
// 접근은 헤더 nav와 푸터 링크로만 한다.
// 푸터는 components/layout/MarketingFooter로 분리 — 요금제·FAQ와 공통.

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

// 한 칸이 머무는 시간(ms). 아래 진행 바 애니메이션과 같은 값을 써야 싱크가 맞는다.
const STEP_DWELL_MS = 2600;

// HOW 섹션 — 필름이 한 칸씩 감기듯 01 → 02 → 03이 순서대로 밝아진다.
// 내용은 항상 전부 보이고 강조만 이동하므로, 모션이 꺼져도 정보 손실이 없다.
function HowFilm() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // 모션을 끈 사용자는 순환시키지 않고 전 단계를 동등하게 보여준다.
    if (reduced || paused) return;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % STEPS.length),
      STEP_DWELL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced, paused]);

  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0E0E0F]">
      <TapeStrip
        running={!reduced && !paused}
        className="border-b border-white/[0.06]"
      />

      <div
        className="grid md:grid-cols-3"
        onMouseLeave={() => setPaused(false)}
      >
        {STEPS.map((s, i) => {
          // 모션 off일 땐 전부 '현재'로 취급해 흐린 칸이 남지 않게 한다.
          const on = reduced || i === active;
          return (
            <div
              key={s.n}
              // 포인터를 올린 칸에서 멈춘다 — 읽는 동안 넘어가버리지 않도록.
              onMouseEnter={() => {
                setPaused(true);
                setActive(i);
              }}
              className="relative px-[30px] pb-[38px] pt-[34px] transition-colors duration-500"
              style={{
                borderLeft: i ? "1px dashed rgba(255,255,255,.12)" : "none",
                background: on ? "rgba(255,255,255,.022)" : "transparent",
              }}
            >
              <span
                className="mb-[18px] block font-mono text-[58px] font-extrabold leading-[.8] tracking-[-3px] transition-colors duration-500"
                // 비활성 단계도 읽을 수 있어야 한다 — .16은 대비 1.57로 WCAG AA(큰 글자 3:1) 미달이었다.
                style={{ color: on ? GREEN : "rgba(255,255,255,.42)" }}
              >
                {s.n}
              </span>
              <h3
                className="mb-2 text-[22px] font-extrabold tracking-[-.4px] transition-colors duration-500"
                style={{ color: on ? "#FFFFFF" : "rgba(255,255,255,.62)" }}
              >
                {s.t}
              </h3>
              <p
                className="text-[14.5px] leading-[1.65] transition-colors duration-500"
                style={{
                  // .32는 대비 2.84로 본문 기준(4.5:1) 미달이라 .56으로 올렸다.
                  color: on ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.56)",
                }}
              >
                {s.d}
              </p>

              {/* 노출 게이지 — 이 칸에 머무는 동안 그린이 차오른다 */}
              <span
                aria-hidden
                className="absolute bottom-0 left-0 h-[2px] w-full"
                style={{ background: "rgba(255,255,255,.06)" }}
              />
              {!reduced && i === active ? (
                <span
                  aria-hidden
                  // key로 매 전환마다 리마운트해 애니메이션을 처음부터 재생시킨다.
                  key={`${active}-${paused}`}
                  className={`absolute bottom-0 left-0 h-[2px] w-full ${paused ? "" : "hc-film-progress"}`}
                  style={{
                    background: GREEN,
                    ["--hc-film-dwell" as string]: `${STEP_DWELL_MS}ms`,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <TapeStrip
        running={!reduced && !paused}
        className="border-t border-white/[0.06]"
      />
    </div>
  );
}

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
      <Reveal
        as="span"
        className="relative block text-[46px] font-black leading-[1.24] tracking-[-2.4px] sm:text-[68px] lg:text-[88px] lg:leading-[1.18] lg:tracking-[-4px]"
      >
        <h1>
          어디서든,
          <br />
          하루를 <span className="hc-gradient-text">촬영해요</span>
        </h1>
      </Reveal>
      <Reveal
        as="span"
        delay={120}
        className="relative mb-9 mt-6 block max-w-[440px] text-[16px] leading-[1.6] text-[#B3B3B3] sm:text-[18px]"
      >
        <p>부스 앞에 줄 서지 않아도 돼요. 카페에서, 집에서, 지금 바로 네 컷.</p>
      </Reveal>

      {/*
        지금 단계의 목표는 "비회원 체험 -> 가입 전환"인데, 그 입구가 랜딩에 없었다.
        헤더 CTA 를 눌러 /login 까지 가야 비회원 체험 버튼을 만났다. 첫 화면에서 바로 연다.
        헤더 CTA 가 이미 초록이라 여기는 흰 버튼을 쓴다(한 화면 한 초록).
      */}
      <Reveal delay={180} className="relative flex flex-wrap items-center justify-center gap-3">
        <GuestTrialStartButton className="inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-3 text-[15px] font-extrabold text-[#0B0B0C] transition hover:bg-[#f1f1ee]">
          가입 없이 찍어보기
        </GuestTrialStartButton>
        <Link
          href="/login"
          className="inline-flex items-center gap-1 rounded-full px-4 py-3 text-[14px] font-semibold text-white/80 underline underline-offset-4 transition hover:text-white"
        >
          로그인하고 시작하기 <ArrowRight className="h-4 w-4" />
        </Link>
      </Reveal>

      {/* 흩뿌린 폴라로이드 콜라주 — 하단 마감 */}
      <Reveal
        delay={220}
        className="relative mt-12 flex w-full items-end justify-center sm:mt-14"
      >
        <div
          className="-mr-8 h-[150px] drop-shadow-2xl sm:-mr-10 sm:h-[196px] lg:h-[232px]"
          style={{ transform: "rotate(-12deg) translateY(10px)", zIndex: 1 }}
        >
          <ShowcaseFrame id="classic-4" className="!h-full !w-auto" />
        </div>
        <div
          className="h-[188px] drop-shadow-2xl sm:h-[244px] lg:h-[290px]"
          style={{ transform: "rotate(3deg)", zIndex: 3 }}
        >
          <ShowcaseFrame id="grid-4" className="!h-full !w-auto" />
        </div>
        <div
          className="-ml-8 h-[150px] drop-shadow-2xl sm:-ml-10 sm:h-[196px] lg:h-[232px]"
          style={{ transform: "rotate(12deg) translateY(10px)", zIndex: 2 }}
        >
          <ShowcaseFrame id="polaroid-4" className="!h-full !w-auto" />
        </div>
      </Reveal>
    </section>
  );
}

export function LandingView() {
  return (
    <div className="min-h-dvh bg-[#0B0B0C] text-white">
      <MarketingNav tone="dark" />

      <HeroEditorial />

      {/* HOW */}
      <section id="how" className="border-y border-white/[0.1] bg-black">
        <div className="mx-auto max-w-[1160px] px-7 py-[76px]">
          <Reveal className="mb-10">
            <h2 className="text-[40px] font-extrabold leading-[1.05] tracking-[-1.4px]">
              찍고, 꾸미고, 남기고.
              <br />네 컷이면 끝.
            </h2>
          </Reveal>

          <HowFilm />
        </div>
      </section>

      {/* CUSTOM FRAME — 프레임 종류(부스도 다 있는 것) 대신, 부스와 겹치지 않는
          유일한 축이자 요금제 1행인 "커스텀 프레임"을 랜딩 주인공으로 세운다. */}
      <section id="custom" className="mx-auto max-w-[1160px] px-7 py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <h2 className="text-[38px] font-extrabold leading-[1.14] tracking-[-1.2px]">
              고르는 게 아니라,
              <br />
              <span className="hc-gradient-text">만드는 거예요.</span>
            </h2>
            <p className="mt-6 max-w-[420px] text-[15.5px] leading-[1.75] text-white/60">
              부스에선 정해진 프레임에 사진이 박힙니다. 하루컷은 그 위에 스티커를
              붙이고, 글씨를 얹고, 배경을 깎아내요. 같은 네 컷을 찍어도 남는 건
              전부 달라집니다.
            </p>

            <Link
              href="/features"
              className="mt-9 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-white hover:opacity-80"
            >
              기능 자세히 보기 <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>

          {/* 같은 프레임·같은 사진, 꾸미기만 다르게 — 실제 렌더러로 그린 대비 */}
          <Reveal delay={140}>
            {/* 높이로 폭이 정해지는 미리보기 두 장이라, 좁은 화면에서는 높이를 같이 줄여야
                가로로 넘치지 않는다(320px 에서 21px 넘쳤다). clamp 로 매끄럽게 줄인다. */}
            <div className="flex items-center justify-center gap-3 sm:gap-7">
              <div className="h-[clamp(130px,34vw,268px)] opacity-40 grayscale">
                <FramePreview
                  frameId="grid-4"
                  images={HERO_IMAGES}
                  borderColor="#141416"
                  className="!h-full !w-auto"
                />
              </div>

              <div
                aria-hidden
                className="h-[1px] w-6 shrink-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.28)_0_4px,transparent_4px_8px)] sm:w-9"
              />

              <div className="h-[clamp(156px,41vw,320px)] drop-shadow-2xl">
                <FramePreview
                  frameId="grid-4"
                  images={HERO_IMAGES}
                  theme={DEMO_DECORATED_THEME}
                  borderColor="#141416"
                  className="!h-full !w-auto"
                />
              </div>
            </div>
          </Reveal>
        </div>
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
            시작하기 <ArrowRight className="h-[19px] w-[19px]" />
          </Link>
        </div>
      </section>

      <MarketingFooter tone="dark" />
    </div>
  );
}
