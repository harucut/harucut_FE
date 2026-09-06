"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { AppNav } from "@/components/layout/AppNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { GuestTrialStartButton } from "@/components/guest/GuestTrialStartButton";
import { PAYMENTS_ENABLED } from "@/constants/company";
import {
  ENTERPRISE_TEASER,
  PLANS,
  PRICING_BILLING_PENDING,
  PRICING_DOWNGRADE_NOTE,
  PRICING_HEADLINE,
  PRICING_SUBTITLE,
  PRICING_SUBTITLE_AUTHED,
  toPlanId,
  type Plan,
  type PlanId,
} from "@/constants/plans";
import { PRICING_FAQ } from "@/constants/faq";
import { getMyUserInfo } from "@/lib/userApi";
import { PlanComparisonTable } from "@/components/pricing/PlanComparisonTable";

// 비로그인 방문자용 헤더는 랜딩/FAQ와 동일한 MarketingNav로 통일한다.
// 앱 네비(홈·기록·MY)는 보호 라우트로 튕기므로 비회원에겐 노출하지 않는다.

// FAQ는 constants/faq.ts(단일 소스)로 이동 — 요금제는 PRICING_FAQ만, 전체는 /faq.

function PlanCard({
  plan,
  authed,
  current,
}: {
  plan: Plan;
  authed: boolean;
  /** 이 카드가 지금 이용 중인 플랜인지. */
  current: boolean;
}) {
  // 결제가 닫힌 동안에는 살 수 없는 카드를 강조하지 않는다. 시선은 지금 할 수 있는
  // 것(무료 시작)으로 보낸다. 결제가 열리면 원래대로 베이직이 강조된다.
  const hot = PAYMENTS_ENABLED ? plan.hot : plan.id === "basic";
  // 무료 플랜만 지금 시작할 수 있다.
  const isPurchasable = PAYMENTS_ENABLED || plan.id === "basic";
  // 현재 플랜은 "인기" 같은 마케팅 배지보다 "현재 플랜"이 우선이다.
  const badge = current ? "현재 플랜" : plan.badge;

  return (
    <div
      className={`relative flex flex-col rounded-[20px] border p-6 ${
        current
          ? "border-(--hc-primary) bg-(--hc-accent-soft-bg) shadow-(--hc-button-shadow) ring-2 ring-(--hc-primary)"
          : hot
            ? "border-(--hc-primary) bg-(--hc-accent-soft-bg) shadow-(--hc-button-shadow)"
            : "hc-surface-card"
      }`}
    >
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full bg-(--hc-primary) px-2.5 py-1 text-[11px] font-extrabold text-(--hc-primary-contrast)">
          {badge}
        </span>
      ) : null}

      <span
        className={`text-[15px] font-extrabold tracking-[0.3px] ${
          hot || current
            ? "text-(--hc-primary-strong)"
            : "text-(--hc-text)"
        }`}
      >
        {plan.name}
      </span>

      <div className="mb-0.5 mt-2.5 flex items-baseline gap-1.5">
        {/* 이름이 이미 '무료' 인 카드에 가격까지 '무료' 라고 쓰면 같은 말을 두 번 한다. 숫자 자리에는 숫자. */}
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.6px] text-(--hc-text)">
          {plan.price === "무료" ? "₩0" : plan.price}
        </span>
        <span className="text-[13px] text-(--hc-muted)">{plan.sub}</span>
      </div>

      <div className="my-4 h-px w-full bg-(--hc-border)" />

      <ul className="flex flex-col gap-2.75">
        {plan.feats.map(([label, on, note]) => (
          <li
            key={label}
            className="flex items-start gap-2.5"
          >
            <span
              className={`mt-px grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full ${
                on
                  ? "bg-(--hc-accent-soft-bg)"
                  : "border-[1.5px] border-(--hc-border-strong)"
              }`}
            >
              {on ? (
                <Check className="h-3 w-3 text-(--hc-primary-strong)" strokeWidth={3} />
              ) : (
                <X className="h-2.75 w-2.75 text-(--hc-muted)" />
              )}
            </span>
            {/* 미지원 항목은 opacity로 흐리지 않는다 — 대비가 2.58까지 떨어져 읽기 어려웠다.
                X 아이콘과 muted 색으로 구분하고 명도 대비는 지킨다. */}
            <span
              className={`text-[13px] leading-[1.4] ${
                on ? "text-(--hc-text)" : "text-(--hc-muted)"
              }`}
            >
              {label}
              {note ? (
                <b
                  className={`font-bold ${
                    on ? "text-(--hc-text)" : "text-(--hc-muted)"
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

      {/*
        CTA — 이용 중인 플랜은 누를 곳이 없고, 결제가 닫힌 동안 나머지도 누를 곳이 없다.
        지금 실제로 할 수 있는 것은 비회원이 무료로 가입하는 것 하나뿐이다.
      */}
      {current ? (
        <span className="mt-5 flex h-12.5 w-full items-center justify-center rounded-full border border-(--hc-primary) text-[15px] font-extrabold text-(--hc-primary-strong)">
          현재 이용 중
        </span>
      ) : !isPurchasable ? (
        /*
          ₩3,900 이 적힌 카드에 "무료로 시작하기" 버튼이 달려 있었다. 누르면 무료 가입으로
          가는 게 맞지만, 가격 옆에 그 문구가 있으면 "베이직을 공짜로 준다"로 읽힌다.
          살 수 없는 동안에는 버튼을 두지 않고 상태만 말한다 — 로그인 여부와 상관없이 같다.
        */
        <p className="mt-5 flex h-12.5 items-center justify-center text-[14px] font-semibold text-(--hc-muted)">
          결제 준비 중
        </p>
      ) : authed ? (
        /*
          이미 계정이 있는 사람에게는 "무료로 시작하기"가 할 말이 아니다. 게다가 결제가
          닫혀 있어 플랜을 바꿀 수도 없다 — 마이페이지로 보내 봐야 거기 있는 요금제 동작은
          이 화면으로 되돌아오는 링크뿐이라 왕복만 한다. 상태만 말한다.
        */
        <p className="mt-5 flex h-12.5 items-center justify-center text-[14px] font-semibold text-(--hc-muted)">
          결제 준비 중
        </p>
      ) : (
        <Link
          href="/signup"
          className={`mt-5 flex h-12.5 w-full items-center justify-center rounded-full text-[15px] font-extrabold transition ${
            hot
              ? "hc-button-primary"
              : "hc-surface-well border text-(--hc-text) hover:border-(--hc-border-strong)"
          }`}
        >
          {plan.id === "basic" ? "무료로 시작하기" : `${plan.name} 시작하기`}
        </Link>
      )}
    </div>
  );
}

export function PricingView({ authed = false }: { authed?: boolean }) {
  const [open, setOpen] = useState(0);
  const [currentPlanId, setCurrentPlanId] = useState<PlanId | null>(null);

  // 현재 플랜은 로그인 상태에서만 조회한다. 비회원까지 호출하면 clientApi가
  // 401 → 재발급 시도까지 태우게 되므로, 서버가 넘겨준 authed로 먼저 걸러낸다.
  // 실패하면 조용히 넘어간다 — 배지가 안 붙을 뿐 가격표는 그대로 보여야 한다.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    getMyUserInfo()
      .then((user) => {
        if (!cancelled) setCurrentPlanId(toPlanId(user.planTier));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authed]);

  // 비회원 전용 FAQ("비회원도 사용할 수 있나요?")는 로그인 후엔 의미가 없다.
  const faqItems = authed
    ? PRICING_FAQ.filter((item) => !item.guestOnly)
    : PRICING_FAQ;

  return (
    <main
      className={`hc-page-app min-h-dvh text-(--hc-text) ${
        authed ? "pb-22.5 lg:pb-0" : "hc-stage-dark pb-10"
      }`}
    >
      {authed ? <AppNav /> : <MarketingNav width="max-w-5xl" />}

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-7 py-6 sm:py-8 lg:gap-14 lg:py-10">
        {/* 헤더 */}
        <header className="pt-1 lg:pt-0">
          <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.6px] sm:text-[28px] lg:text-[32px]">
            {PRICING_HEADLINE}
          </h1>
          <p className="mt-3 max-w-120 text-[14px] leading-normal text-(--hc-muted)">
            {authed ? PRICING_SUBTITLE_AUTHED : PRICING_SUBTITLE}
          </p>
        </header>

        {/* 개인 플랜 카드 — <md 1열, md+ 2열. 세 번째 선택지는 아래 엔터프라이즈 섹션이다. */}
        <section className="grid items-stretch gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              authed={authed}
              current={currentPlanId === plan.id}
            />
          ))}
        </section>

        {/*
          쿠폰으로 프로를 받은 사용자가 있다. 프로는 더 이상 팔지 않아 카드가 없는데,
          그러면 이 사람만 어느 카드에도 "현재 플랜" 배지가 안 붙어 자기 등급이 사라진 것처럼
          보인다. 카드를 되살리는 대신 한 줄로 말해 준다.
        */}
        {currentPlanId === "pro" ? (
          <p className="-mt-6 text-[13px] leading-[1.6] text-(--hc-muted)">
            지금 <b className="font-bold text-(--hc-text)">프로</b> 를 이용
            중이에요. 새로 가입할 수는 없는 플랜이지만, 쓰던 혜택(커스텀 프레임 무제한·보관
            기간 무제한)은 그대로예요.
          </p>
        ) : null}

        {/*
          Enterprise — 팬미팅·행사용 QR 촬영.
          예전에는 점선 테두리 + "추후" 배지 + 고스트 버튼이라, 지금 살 수 있는 유일한
          B2B 상품이 화면에서 가장 약하게 그려져 있었다. 개인 요금제가 결제 대기인 지금
          이게 실제로 파는 물건이므로, 그에 맞는 무게로 보여준다.
        */}
        <section className="flex flex-col gap-4 rounded-[20px] border border-(--hc-accent-soft-border) bg-(--hc-accent-soft-bg) p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[16px] font-extrabold tracking-[0.3px] text-(--hc-text)">
                {ENTERPRISE_TEASER.name}
              </span>
              {/* 배경은 --hc-primary. -accent-soft-text(#0b6b30) 위에 -primary-contrast 를
                  올리면 라이트에서 2.84:1 로 떨어진다(실측). */}
              <span className="rounded-full bg-(--hc-primary) px-2 py-0.5 text-[11px] font-bold text-(--hc-primary-contrast)">
                {ENTERPRISE_TEASER.badge}
              </span>
              {/* 다른 카드가 모두 가격을 보여주므로 여기도 값이 어떻게 정해지는지 밝힌다. */}
              <span className="text-[12px] font-semibold text-(--hc-accent-soft-text)">
                {ENTERPRISE_TEASER.price}
              </span>
            </div>
            <p className="max-w-130 text-[13px] leading-[1.7] text-(--hc-text)">
              {ENTERPRISE_TEASER.desc}
            </p>
          </div>
          <Link
            href={ENTERPRISE_TEASER.href}
            // 한 화면에 초록은 하나. 이 카드가 있는 화면엔 이미 요금제 CTA 가 초록이라
            // 여기서는 한 단 낮춘다(DESIGN.md: 강조는 한 화면에 하나).
            className="hc-button-secondary flex h-12 shrink-0 items-center justify-center rounded-full border px-7 text-[15px] font-semibold"
          >
            {ENTERPRISE_TEASER.cta}
          </Link>
        </section>

        {/* 전체 스펙 비교 — 기능(행) × 플랜(열) 매트릭스 */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[20px] font-extrabold tracking-tight lg:text-[22px]">
            전체 스펙 비교
          </h2>
          <PlanComparisonTable currentPlanId={currentPlanId} />
          <p className="text-[11px] leading-[1.6] text-(--hc-muted)">
            가격은 부가세 포함이에요. {PRICING_BILLING_PENDING}
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
            {faqItems.map((item, i) => {
              const on = open === i;
              return (
                <div
                  key={item.q}
                  className="border-t border-(--hc-border)"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(on ? -1 : i)}
                    aria-expanded={on}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left"
                  >
                    <span className="text-[15px] font-bold tracking-tight text-(--hc-text)">
                      {item.q}
                    </span>
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-(--hc-border-strong) text-(--hc-muted) transition-transform"
                      style={{ transform: on ? "rotate(45deg)" : "none" }}
                    >
                      +
                    </span>
                  </button>
                  {on ? (
                    <p className="mb-4 max-w-170 text-[14px] leading-[1.65] text-(--hc-muted)">
                      {item.a}
                    </p>
                  ) : null}
                </div>
              );
            })}
            <div className="border-t border-(--hc-border)" />
          </div>
        </section>

        {/* 하단 CTA — 가입 유도라서 로그인 상태에서는 통째로 감춘다. */}
        {authed ? null : (
          <section className="flex flex-col items-center gap-4 rounded-[20px] border border-(--hc-border) bg-(--hc-surface) px-6 py-10 text-center">
            <h2 className="text-[22px] font-extrabold tracking-tight lg:text-[24px]">
              비회원도 촬영은 무료예요
            </h2>
            <p className="max-w-105 text-[14px] leading-[1.6] text-(--hc-muted)">
              먼저 무료로 찍어보고, 저장·보관이 필요해지면 그때 플랜을 올리면
              돼요.
            </p>
            {/* 이 절은 비회원 촬영 이야기다. 위 카드의 '무료로 시작하기'(가입)와 의도가 다르므로 문구도 다르다. */}
            <GuestTrialStartButton className="hc-button-primary mt-1 inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-extrabold" />
          </section>
        )}
      </div>

      {/* 푸터 — 랜딩/FAQ와 공통(전자상거래법 표시사항 포함) */}
      <MarketingFooter width="max-w-5xl" />

      {authed ? <MobileTabBar publicShoot /> : null}
    </main>
  );
}
