"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { AppNav } from "@/components/layout/AppNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import {
  ENTERPRISE_TEASER,
  PLANS,
  PRICING_DOWNGRADE_NOTE,
  PRICING_HEADLINE,
  PRICING_SUBTITLE,
  type Plan,
} from "@/constants/plans";
import { COMPANY } from "@/constants/company";
import { PRICING_FAQ } from "@/constants/faq";
import { PlanComparisonTable } from "@/components/pricing/PlanComparisonTable";

// 비로그인 방문자용 헤더는 랜딩/FAQ와 동일한 MarketingNav로 통일한다.
// 앱 네비(홈·기록·MY)는 보호 라우트로 튕기므로 비회원에겐 노출하지 않는다.

// FAQ는 constants/faq.ts(단일 소스)로 이동 — 요금제는 PRICING_FAQ만, 전체는 /faq.

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
      {plan.badge ? (
        <span className="absolute right-4 top-4 rounded-full bg-[color:var(--hc-primary)] px-2.5 py-1 text-[11px] font-extrabold text-[color:var(--hc-primary-contrast)]">
          {plan.badge}
        </span>
      ) : null}

      <span
        className={`text-[15px] font-extrabold tracking-[0.3px] ${
          hot ? "text-[color:var(--hc-primary)]" : "text-[color:var(--hc-text)]"
        }`}
      >
        {plan.name}
      </span>

      <div className="mb-0.5 mt-2.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.6px] text-[color:var(--hc-text)]">
          {plan.price}
        </span>
        <span className="text-[13px] text-[color:var(--hc-muted)]">{plan.sub}</span>
      </div>

      <div className="my-4 h-px w-full bg-[color:var(--hc-border)]" />

      <ul className="flex flex-col gap-[11px]">
        {plan.feats.map(([label, on, note]) => (
          <li
            key={label}
            className="flex items-start gap-2.5"
            style={{ opacity: on ? 1 : 0.4 }}
          >
            <span
              className={`mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
                on
                  ? "bg-[color:var(--hc-accent-soft-bg)]"
                  : "border-[1.5px] border-[color:var(--hc-border-strong)]"
              }`}
            >
              {on ? (
                <Check className="h-3 w-3 text-[color:var(--hc-primary)]" strokeWidth={3} />
              ) : (
                <X className="h-[11px] w-[11px] text-[color:var(--hc-muted)]" />
              )}
            </span>
            <span className="text-[13.5px] leading-[1.4] text-[color:var(--hc-text)]">
              {label}
              {note ? (
                <b
                  className={`font-bold ${
                    on ? "text-[color:var(--hc-text)]" : "text-[color:var(--hc-muted)]"
                  }`}
                >
                  {" · "}
                  {note}
                </b>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href="/signup"
        className={`mt-5 flex h-[50px] w-full items-center justify-center rounded-full text-[14.5px] font-extrabold transition ${
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

export function PricingView({ authed = false }: { authed?: boolean }) {
  const [open, setOpen] = useState(0);

  return (
    <main
      className={`hc-page-app min-h-dvh text-[color:var(--hc-text)] ${
        authed ? "pb-[90px] lg:pb-0" : "pb-10"
      }`}
    >
      {authed ? <AppNav publicShoot /> : <MarketingNav width="max-w-5xl" />}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-7 py-6 sm:py-8 lg:gap-14 lg:py-10">
        {/* 헤더 */}
        <header className="pt-1 lg:pt-0">
          <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-[color:var(--hc-primary)]">
            PRICING · 요금제
          </span>
          <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.6px] sm:text-[28px] lg:text-[32px]">
            {PRICING_HEADLINE}
          </h1>
          <p className="mt-3 max-w-[480px] text-[14px] leading-[1.5] text-[color:var(--hc-muted)]">
            {PRICING_SUBTITLE}
          </p>
        </header>

        {/* 플랜 카드 — <lg 1열, lg+ 3열 */}
        <section className="grid items-stretch gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </section>

        {/* Enterprise — 추후 출시 예정(팬미팅·행사용 QR 촬영) */}
        <section className="flex flex-col gap-3 rounded-[20px] border border-dashed border-[color:var(--hc-border-strong)] bg-[color:var(--hc-surface)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-extrabold tracking-[0.3px] text-[color:var(--hc-text)]">
                {ENTERPRISE_TEASER.name}
              </span>
              <span className="rounded-full border border-[color:var(--hc-border-strong)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--hc-muted)]">
                {ENTERPRISE_TEASER.badge}
              </span>
            </div>
            <p className="max-w-[520px] text-[13px] leading-[1.6] text-[color:var(--hc-muted)]">
              {ENTERPRISE_TEASER.desc}
            </p>
          </div>
          <a
            href={`mailto:${COMPANY.email}`}
            className="hc-surface-well flex h-[46px] shrink-0 items-center justify-center rounded-full border px-6 text-[13.5px] font-extrabold text-[color:var(--hc-text)] transition hover:border-[color:var(--hc-border-strong)]"
          >
            {ENTERPRISE_TEASER.cta}
          </a>
        </section>

        {/* 전체 스펙 비교 — 기능(행) × 플랜(열) 매트릭스 */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-extrabold tracking-tight lg:text-[22px]">
            전체 스펙 비교
          </h2>
          <PlanComparisonTable />
          <p className="text-[11px] leading-[1.6] text-[color:var(--hc-muted)]">
            가격은 부가세 포함이에요. 플랜은 마이페이지에서 언제든 바꿀 수 있어요.
            <br />
            {PRICING_DOWNGRADE_NOTE}
          </p>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-extrabold tracking-tight lg:text-[22px]">
            자주 묻는 질문
          </h2>
          <div className="flex flex-col">
            {PRICING_FAQ.map((item, i) => {
              const on = open === i;
              return (
                <div
                  key={item.q}
                  className="border-t border-[color:var(--hc-border)]"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(on ? -1 : i)}
                    aria-expanded={on}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span className="text-[15px] font-bold tracking-tight text-[color:var(--hc-text)]">
                      {item.q}
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
                      {item.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <div className="border-t border-[color:var(--hc-border)]" />
          </div>
        </section>

        {/* 하단 CTA */}
        <section className="flex flex-col items-center gap-4 rounded-[20px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-6 py-10 text-center">
          <h2 className="text-[22px] font-extrabold tracking-tight lg:text-[24px]">
            비회원도 촬영은 무료예요
          </h2>
          <p className="max-w-[420px] text-[14px] leading-[1.6] text-[color:var(--hc-muted)]">
            먼저 무료로 찍어보고, 저장·보관이 필요해지면 그때 플랜을 올리면 돼요.
          </p>
          <Link
            href="/signup"
            className="hc-button-primary mt-1 flex h-[50px] items-center justify-center rounded-full px-8 text-[14.5px] font-extrabold"
          >
            시작하기
          </Link>
        </section>

      </div>

      {/* 푸터 — 랜딩/FAQ와 공통(전자상거래법 표시사항 포함) */}
      <MarketingFooter width="max-w-5xl" />

      {authed ? <MobileTabBar publicShoot /> : null}
    </main>
  );
}
