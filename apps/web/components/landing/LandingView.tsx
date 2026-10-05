"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { DEMO_DECORATED_THEME } from "@/constants/demoTheme";
import { FramePreview } from "@/components/frame/FramePreview";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { TapeStrip } from "@/components/ui/TapeStrip";
import type { FrameId } from "@/constants/frames";
import { DEMO_PHOTOS } from "@/constants/demoPhotos";

// STUDIO 마케팅 스테이지는 딥다크 고정(핸드오프 디자인 그대로).
const GREEN = "#1ED760";

// 랜딩 미리보기는 한 변이 200px 남짓인데 원본은 900x1200 PNG(1.2MB)였다. 같은 파일이
// 화면에 20 번 들어가 첫 로드를 그대로 잡아먹었다. 표시 크기에 맞춘 webp(30KB)를 쓴다.
// 슬롯 넉 장에 서로 다른 사진이 들어간다(constants/demoPhotos.ts 주석 참고).
const HERO_IMAGES = DEMO_PHOTOS;

// 02는 바로 아래 나만의 프레임 섹션이 자세히 다루므로 여기선 한 줄만 걸어둔다.
const STEPS = [
  { n: "01", t: "기록 남기기", d: "카메라로 8장을 찍거나, 갤러리에서 골라요." },
  { n: "02", t: "프레임 꾸미기", d: "프레임 위에 스티커와 글씨를 얹어요." },
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
      // 첫 화면의 그림이다 — lazy 면 LCP 가 스크롤 판정을 기다린다.
      imageLoading="eager"
    />
  );
}

// 읽는 순서는 배치로 전달한다. 정보 없는 자동 강조·진행 바는 두지 않는다.
function HowFilm() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/8 bg-[#0E0E0F]">
      <TapeStrip className="border-b border-white/6" />
      <ol className="divide-y divide-white/10 px-7">
        {STEPS.map((step) => (
          <li key={step.t} className="grid gap-2 py-6 md:grid-cols-[1fr_2fr] md:gap-8">
            <h3 className="text-xl font-bold text-white">{step.t}</h3>
            <p className="text-[15px] leading-[1.65] text-white/70">{step.d}</p>
          </li>
        ))}
      </ol>
      <TapeStrip className="border-t border-white/6" />
    </div>
  );
}

function HeroEditorial() {
  return (
    <section className="relative mx-auto flex max-w-290 flex-col items-center justify-center overflow-hidden px-7 pb-16 pt-10 sm:pt-16 text-center">
      {/* 헤드라인 — Pretendard Black, 초대형(type-first) */}
      <div
        className="min-w-0 relative block text-[40px] font-black leading-[1.24] tracking-[-2.4px] sm:text-[60px] lg:text-[76px] lg:leading-[1.18] lg:tracking-[-4px]"
      >
        <h1>
          어디서든,
          <br />
          하루를 <span className="hc-accent-word">촬영해요</span>
        </h1>
      </div>
      <div
        className="min-w-0 relative mb-9 mt-6 block max-w-110 text-[16px] leading-[1.6] text-[#B3B3B3] sm:text-[18px]"
      >
        <p>부스 앞에 줄 서지 않아도 돼요. 카페에서, 집에서, 지금 바로 네 컷.</p>
      </div>

      {/*
        지금 단계의 목표는 "비회원 체험 -> 가입 전환"인데, 그 입구가 랜딩에 없었다.
        헤더 CTA 를 눌러 /login 까지 가야 비회원 체험 버튼을 만났다. 첫 화면에서 바로 연다.
        헤더 CTA 가 이미 초록이라 여기는 흰 버튼을 쓴다(한 화면 한 초록).
      */}
      <div className="min-w-0 relative flex flex-wrap items-center justify-center gap-3">
        {/* 문구는 넘기지 않는다 — 기본값이 곧 로그인 화면·앱과 같은 한 문구다.
            예전에는 여기만 "가입 없이 찍어보기"였는데, 이 체험은 찍기만이 아니라
            이미지 저장까지 되므로 실제보다 작게 말하는 문구이기도 했다. */}
        <GuestTrialStartButton className="hc-button-neutral inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-7 text-[15px] font-extrabold" />
        <Link
          href="/login"
          className="inline-flex items-center gap-1 rounded-full px-4 py-3 text-[14px] font-semibold text-white/80 underline underline-offset-4 transition hover:text-white"
        >
          로그인 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 흩뿌린 폴라로이드 콜라주 — 하단 마감 */}
      <div
        className="min-w-0 relative mt-12 flex w-full items-end justify-center sm:mt-14"
      >
        <div
          className="-mr-8 h-37.5 drop-shadow-2xl sm:-mr-10 sm:h-49 lg:h-58"
          style={{ transform: "rotate(-12deg) translateY(10px)", zIndex: 1 }}
        >
          <ShowcaseFrame id="classic-4" className="h-full! w-auto!" />
        </div>
        <div
          className="h-47 drop-shadow-2xl sm:h-61 lg:h-72.5"
          style={{ transform: "rotate(3deg)", zIndex: 3 }}
        >
          <ShowcaseFrame id="grid-4" className="h-full! w-auto!" />
        </div>
        <div
          className="-ml-8 h-37.5 drop-shadow-2xl sm:-ml-10 sm:h-49 lg:h-58"
          style={{ transform: "rotate(12deg) translateY(10px)", zIndex: 2 }}
        >
          <ShowcaseFrame id="polaroid-4" className="h-full! w-auto!" />
        </div>
      </div>
    </section>
  );
}

export function LandingView() {
  return (
    <main className="hc-stage-dark min-h-dvh bg-[#0B0B0C] text-white">
      <MarketingNav cta="primary" />

      <HeroEditorial />

      {/* HOW */}
      <section id="how" className="border-y border-white/10 bg-black">
        <div className="mx-auto max-w-290 px-7 py-19">
          <div className="min-w-0 mb-10">
            <h2 className="text-[40px] font-extrabold leading-[1.05] tracking-[-1.4px]">
              찍고, 꾸미고, 남기고.
              <br />네 컷이면 끝.
            </h2>
          </div>

          <HowFilm />
        </div>
      </section>

      {/* 나만의 프레임 — 프레임 종류(부스도 다 있는 것) 대신, 부스와 겹치지 않는
          유일한 축이자 요금제 1행인 "커스텀 프레임"을 랜딩 주인공으로 세운다. */}
      <section id="custom" className="mx-auto max-w-290 px-7 py-20">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div className="min-w-0">
            <h2 className="text-[38px] font-extrabold leading-[1.14] tracking-[-1.2px]">
              고르는 게 아니라,
              <br />
              <span className="hc-accent-word">만드는 거예요.</span>
            </h2>
            <p className="mt-6 max-w-105 text-[15px] leading-[1.75] text-white/60">
              부스에선 정해진 프레임에 사진이 박힙니다. 하루컷은 그 위에 스티커를
              붙이고, 글씨를 얹고, 배경을 깎아내요. 같은 네 컷을 찍어도 남는 건
              전부 달라집니다.
            </p>

            <Link
              href="/features"
              className="mt-9 inline-flex items-center gap-1.5 text-[15px] font-bold text-white hover:opacity-80"
            >
              기능 자세히 보기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* 같은 프레임·같은 사진, 프레임 꾸미기만 다르게 — 실제 렌더러로 그린 대비 */}
          <div className="min-w-0">
            {/* 높이로 폭이 정해지는 미리보기 두 장이라, 좁은 화면에서는 높이를 같이 줄여야
                가로로 넘치지 않는다(320px 에서 21px 넘쳤다). clamp 로 매끄럽게 줄인다. */}
            <div className="flex items-center justify-center gap-3 sm:gap-7">
              <div className="h-[clamp(130px,34vw,268px)] opacity-40 grayscale">
                <FramePreview
                  frameId="grid-4"
                  images={HERO_IMAGES}
                  borderColor="#141416"
                  className="h-full! w-auto!"
                />
              </div>

              <div
                aria-hidden
                className="h-0.25 w-6 shrink-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.28)_0_4px,transparent_4px_8px)] sm:w-9"
              />

              <div className="h-[clamp(156px,41vw,320px)] drop-shadow-2xl">
                <FramePreview
                  frameId="grid-4"
                  images={HERO_IMAGES}
                  theme={DEMO_DECORATED_THEME}
                  borderColor="#141416"
                  className="h-full! w-auto!"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*
        EVENT — 행사(B2B) 축.
        랜딩이 개인 사용자 이야기만 하고 있어서, 행사 주최자가 들어와도 자기 이야기를
        찾을 자리가 없었다. 제품이 파는 두 축 중 하나가 화면에 아예 없던 셈이다.
      */}
      <section id="event" className="border-y border-white/10 bg-black">
        <div className="mx-auto flex max-w-290 flex-col gap-7 px-7 py-20 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-140 flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[11px] font-extrabold tracking-[1px] text-white/70">
              행사 사진
            </span>
            <h2 className="text-[28px] font-extrabold leading-[1.2] tracking-[-1px] text-white lg:text-[38px]">
              행사에서는 부스 대신 QR 한 장
            </h2>
            <p className="text-[15px] leading-[1.75] text-white/70 lg:text-[16px]">
              팬미팅·페스티벌·사내 행사용 QR을 만들어 드려요. 참가자 화면에 행사 이름이 뜨고,
              행사에 맞춘 컷 구성으로 앱도 가입도 없이 자기 휴대폰에 남깁니다. 줄도,
              인화 대기도 없어요.
            </p>
          </div>
          <Link
            href="/enterprise"
            className="hc-button-neutral inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-7 text-[15px] font-extrabold w-fit"
          >
            행사 도입 알아보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-290 px-7 pb-22.5 pt-5">
        <div
          // 모바일에서 좌우 40px 패딩이 제목에 254px 밖에 안 남겨, 30px 글자가 억지로
          // 두 줄로 접혔다(그 바람에 "네 컷"이 갈라졌다). 좁은 화면에선 패딩과 글자를 함께 줄인다.
          className="flex flex-wrap items-center justify-between gap-5 rounded-3xl px-6 py-8 sm:px-10 sm:py-9"
          style={{ background: GREEN }}
        >
          <h2
            className="text-[24px] font-extrabold tracking-[-1px] sm:text-[30px]"
            style={{ color: "#06140A" }}
          >
            하루를 네 컷으로 남겨볼까요?
          </h2>
          <Link
            href="/login"
            className="hc-button-neutral inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-7 text-[15px] font-extrabold"
          >
            시작하기 <ArrowRight className="h-4.75 w-4.75" />
          </Link>
        </div>
      </section>

      <MarketingFooter tone="dark" />
    </main>
  );
}
