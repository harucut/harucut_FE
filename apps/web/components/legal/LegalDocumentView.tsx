import type { ReactNode } from "react";
import type { LegalDocument } from "@harucut/shared";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingNav } from "@/components/layout/MarketingNav";

// 약관·개인정보 처리방침 공통 뷰.
// 상단 네비·푸터는 다른 공개 페이지(랜딩·기능·요금제·FAQ)와 같은 것을 쓴다 —
// 예전에는 이 화면만 단독이라 요금제·FAQ로 돌아갈 길도, 사업자 정보 표시도 없었다.
export function LegalDocumentView({
  document,
  extra,
}: {
  document: LegalDocument;
  // 약관 본문 아래에 덧붙일 추가 섹션(예: 유료 서비스 요금·혜택 안내).
  extra?: ReactNode;
}) {
  return (
    <main className="hc-page-app min-h-dvh pb-16 text-[color:var(--hc-text)]">
      <MarketingNav />

      {/* 컨테이너는 nav·푸터와 같은 1160으로 좌변을 맞추고,
          본문 컬럼만 안쪽에서 폭을 제한해 가독성을 지킨다. */}
      <div className="mx-auto w-full max-w-[1160px] px-7 py-10 lg:py-14">
        <div className="flex max-w-[820px] flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.6px] sm:text-[30px]">
              {document.title}
            </h1>
            <p className="text-[12px] text-[color:var(--hc-muted)]">
              시행일 {document.effectiveDate}
            </p>
            <p className="text-[14px] leading-[1.7] text-[color:var(--hc-muted)]">
              {document.intro}
            </p>
          </header>

          <div className="flex flex-col gap-5 rounded-2xl border border-[color:var(--hc-border)] bg-[color:var(--hc-surface)] p-5">
            {document.sections.map((section) => (
              <section key={section.heading} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-[color:var(--hc-text)]">
                  {section.heading}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-[13px] leading-6 text-[color:var(--hc-muted)]"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="flex list-disc flex-col gap-1.5 pl-5">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="text-[13px] leading-6 text-[color:var(--hc-muted)]"
                      >
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {extra}
        </div>
      </div>

      <MarketingFooter />
    </main>
  );
}
