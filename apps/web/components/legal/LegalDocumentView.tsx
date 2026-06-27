import type { ReactNode } from "react";
import Link from "next/link";
import type { LegalDocument } from "@harucut/shared";
import { BrandMark } from "@/components/layout/BrandMark";

export function LegalDocumentView({
  document,
  extra,
}: {
  document: LegalDocument;
  // 약관 본문 아래에 덧붙일 추가 섹션(예: 유료 서비스 요금·혜택 비교표).
  extra?: ReactNode;
}) {
  return (
    <main className="hc-page-app min-h-dvh px-4 py-6 text-[color:var(--hc-text)]">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between gap-3">
          <BrandMark href="/" />
          <Link
            href="/"
            className="hc-button-secondary rounded-full border px-3 py-1.5 text-[11px]"
          >
            처음으로
          </Link>
        </header>

        <section className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">{document.title}</h1>
          <p className="text-[11px] text-zinc-500">시행일 {document.effectiveDate}</p>
          <p className="text-sm leading-6 text-zinc-400">{document.intro}</p>
        </section>

        <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          {document.sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-[13px] leading-6 text-zinc-400">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="flex list-disc flex-col gap-1.5 pl-5">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="text-[13px] leading-6 text-zinc-400">
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
    </main>
  );
}
