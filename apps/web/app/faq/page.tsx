import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { FAQ_ITEMS } from "@/constants/faq";
import { COMPANY } from "@/constants/company";

export const metadata: Metadata = {
  title: "자주 묻는 질문 | 하루컷",
  description:
    "하루컷 자주 묻는 질문. 비회원 이용, 촬영, 커스텀 프레임, 요금제 차이, 보관·공개 범위까지 한곳에서 확인하세요.",
  alternates: { canonical: "/faq" },
};

// FAQPage 구조화 데이터(JSON-LD) — 유효한 구조화 데이터/토픽 신호용(단일 소스에서 생성).
// 참고: 2023년 정책 변경으로 FAQ 리치 결과 노출은 정부·보건 사이트로 제한됨 — 마크업은 유효하게 유지.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <main className="hc-page-app min-h-dvh pb-16 text-[color:var(--hc-text)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // <, >, & 를 유니코드 이스케이프 — 향후 FAQ 텍스트가 <script>를 깨지 않게.
          __html: JSON.stringify(faqJsonLd)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />

      {/* 헤더 — 랜딩/요금제와 동일한 공통 마케팅 네비 */}
      <MarketingNav />

      {/* 컨테이너는 nav·푸터와 같은 1160으로 맞춰 좌변을 정렬하고,
          가독성을 위해 본문(질문/답변) 컬럼만 안쪽에서 폭을 제한한다. */}
      <div className="mx-auto w-full max-w-[1160px] px-7 py-10 lg:py-14">
        <header className="mb-9">
          <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-[color:var(--hc-primary-strong)]">
            FAQ · 자주 묻는 질문
          </span>
          <h1 className="mt-3 text-[26px] font-extrabold leading-tight tracking-[-0.6px] sm:text-[32px]">
            궁금한 점이 있으신가요?
          </h1>
          <p className="mt-3 max-w-[520px] text-[14px] leading-[1.6] text-[color:var(--hc-muted)]">
            하루컷을 쓰면서 자주 나오는 질문을 모았어요. 더 궁금한 점은 고객문의로 알려주세요.
          </p>
        </header>

        {/* 전체 Q&A — 답변을 항상 노출(검색·접근성 친화). */}
        <dl className="flex max-w-[820px] flex-col border-b border-[color:var(--hc-border)]">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.q}
              className="border-t border-[color:var(--hc-border)] py-6"
            >
              <dt className="text-[17px] font-bold tracking-tight text-[color:var(--hc-text)]">
                {item.q}
              </dt>
              <dd className="mt-2.5 max-w-[680px] text-[15px] leading-[1.7] text-[color:var(--hc-muted)]">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>

        {/* 추가 문의 + CTA */}
        <section className="mt-10 flex max-w-[820px] flex-col items-center gap-3 rounded-[20px] border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] px-6 py-9 text-center">
          <h2 className="text-[19px] font-extrabold tracking-tight">
            찾는 답이 없었나요?
          </h2>
          <p className="text-[14px] leading-[1.6] text-[color:var(--hc-muted)]">
            <a
              href={`mailto:${COMPANY.email}`}
              className="font-semibold text-[color:var(--hc-primary-strong)] underline underline-offset-4"
            >
              {COMPANY.email}
            </a>{" "}
            로 문의하시면 도와드릴게요.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link
              href="/pricing"
              className="hc-surface-well flex h-[44px] items-center rounded-full border px-5 text-[13.5px] font-bold text-[color:var(--hc-text)]"
            >
              요금제 보기
            </Link>
            <Link
              href="/login"
              className="hc-button-primary flex h-[44px] items-center rounded-full px-5 text-[13.5px] font-bold"
            >
              지금 시작하기
            </Link>
          </div>
        </section>

      </div>

      {/* 푸터 — 랜딩/요금제와 공통(전자상거래법 표시사항 포함) */}
      <MarketingFooter />
    </main>
  );
}
