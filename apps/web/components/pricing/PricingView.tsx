"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AppNav } from "@/components/layout/AppNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";

type Plan = {
  id: "basic" | "plus" | "pro";
  name: string;
  price: string;
  sub: string;
  tagline: string;
  feats: string[];
  cta: string;
  href: string;
  hot?: boolean;
};

// 랜딩 PLANS와 동일한 플랜 구성(BASIC/PLUS/PRO)을 요금제 페이지에서도 사용한다.
const PLANS: Plan[] = [
  {
    id: "basic",
    name: "BASIC",
    price: "₩0",
    sub: "/월",
    tagline: "처음 시작하는 분께",
    feats: ["기본 프레임 4종", "사진 + 영상 월 5회", "기록 보관", "링크 공유"],
    cta: "무료로 시작하기",
    href: "/signup",
  },
  {
    id: "plus",
    name: "PLUS",
    price: "₩4,900",
    sub: "/월",
    tagline: "자주 남기는 분께",
    feats: ["영상 월 30회", "워터마크 없이 저장", "원본 화질", "프레임 직접 꾸미기"],
    cta: "PLUS 시작하기",
    href: "/signup",
    hot: true,
  },
  {
    id: "pro",
    name: "PRO",
    price: "₩9,900",
    sub: "/월",
    tagline: "무제한으로 누리고 싶다면",
    feats: ["영상 무제한", "워터마크 없이 저장", "모든 프레임·편집 기능", "우선 지원"],
    cta: "PRO 시작하기",
    href: "/signup",
  },
];

const FAQ_ITEMS: [string, string][] = [
  [
    "비회원도 사용할 수 있나요?",
    "네, 가입 없이도 촬영과 꾸미기를 바로 체험할 수 있어요. 다만 결과물 다운로드·저장, 영상 생성, 기록 보관은 무료 가입(BASIC) 후 이용할 수 있어요.",
  ],
  [
    "플랜은 언제든 바꿀 수 있나요?",
    "네. 마이페이지에서 언제든 플랜을 올리거나 내릴 수 있어요. 변경한 플랜은 다음 결제 주기부터 적용돼요.",
  ],
  [
    "워터마크 없이 저장할 수 있나요?",
    "PLUS·PRO 플랜에서는 워터마크 없이 원본 화질로 저장할 수 있어요. 무료 BASIC은 결과물에 워터마크가 포함돼요.",
  ],
];

function PlanCard({ plan }: { plan: Plan }) {
  const hot = plan.hot;

  return (
    <div
      className={`relative flex flex-col rounded-[20px] border p-6 ${
        hot
          ? "border-[color:var(--hc-primary)] bg-[color:var(--hc-accent-soft-bg)] shadow-[var(--hc-button-shadow)]"
          : "hc-surface-card"
      }`}
    >
      {hot ? (
        <span className="absolute right-5 top-5 rounded-full bg-[color:var(--hc-primary)] px-2.5 py-1 text-[11px] font-extrabold text-[color:var(--hc-primary-contrast)]">
          인기
        </span>
      ) : null}

      <span
        className={`text-[15px] font-extrabold tracking-[0.3px] ${
          hot ? "text-[color:var(--hc-primary)]" : "text-[color:var(--hc-text)]"
        }`}
      >
        {plan.name}
      </span>

      <div className="mb-1.5 mt-3 flex items-baseline gap-1.5">
        <span className="text-[34px] font-extrabold leading-none tracking-[-1.4px] text-[color:var(--hc-text)]">
          {plan.price}
        </span>
        <span className="text-[13px] text-[color:var(--hc-muted)]">{plan.sub}</span>
      </div>
      <p className="mb-5 text-[13.5px] text-[color:var(--hc-muted)]">{plan.tagline}</p>

      <div className="my-1 h-px w-full bg-[color:var(--hc-border)]" />

      <ul className="mb-6 mt-5 flex flex-col gap-3">
        {plan.feats.map((feat) => (
          <li key={feat} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full bg-[color:var(--hc-accent-soft-bg)]">
              <Check className="h-3 w-3 text-[color:var(--hc-primary)]" strokeWidth={3} />
            </span>
            <span className="text-[13.5px] leading-[1.4] text-[color:var(--hc-text)]">
              {feat}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className={`mt-auto flex h-[50px] w-full items-center justify-center rounded-full text-[14.5px] font-extrabold transition ${
          hot
            ? "hc-button-primary"
            : "hc-surface-well border text-[color:var(--hc-text)] hover:border-[color:var(--hc-border-strong)]"
        }`}
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export function PricingView() {
  const [open, setOpen] = useState(0);

  return (
    <main className="hc-page-app min-h-dvh pb-[90px] text-[color:var(--hc-text)] lg:pb-0">
      <AppNav publicShoot />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-6 sm:py-8 lg:gap-14 lg:py-10">
        {/* 헤더 */}
        <header className="pt-1 lg:pt-0">
          <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-[color:var(--hc-primary)]">
            PRICING · 요금제
          </span>
          <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px] lg:text-[34px]">
            나에게 맞는 플랜
          </h1>
          <p className="mt-3 max-w-[480px] text-[14.5px] leading-[1.6] text-[color:var(--hc-muted)]">
            비회원도 촬영은 무료예요. 저장·영상·보관은 플랜에 따라 달라요.
          </p>
        </header>

        {/* 플랜 카드 */}
        <section className="grid items-stretch gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-extrabold tracking-tight lg:text-[22px]">
            자주 묻는 질문
          </h2>
          <div className="flex flex-col">
            {FAQ_ITEMS.map(([q, a], i) => {
              const on = open === i;
              return (
                <div key={q} className="border-t border-[color:var(--hc-border)]">
                  <button
                    type="button"
                    onClick={() => setOpen(on ? -1 : i)}
                    aria-expanded={on}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span className="text-[15px] font-bold tracking-tight text-[color:var(--hc-text)]">
                      {q}
                    </span>
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color:var(--hc-border-strong)] text-[color:var(--hc-muted)] transition-transform"
                      style={{ transform: on ? "rotate(45deg)" : "none" }}
                    >
                      +
                    </span>
                  </button>
                  {on ? (
                    <p className="mb-4 max-w-[680px] text-[14px] leading-[1.65] text-[color:var(--hc-muted)]">
                      {a}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <div className="border-t border-[color:var(--hc-border)]" />
          </div>
        </section>
      </div>

      <MobileTabBar publicShoot />
    </main>
  );
}
