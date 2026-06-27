import type { Metadata } from "next";
import { TERMS_OF_SERVICE } from "@harucut/shared";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { PlanComparisonTable } from "@/components/pricing/PlanComparisonTable";
import { PRICING_DOWNGRADE_NOTE } from "@/constants/plans";

export const metadata: Metadata = {
  title: "서비스 이용약관 | 하루컷",
  description: "하루컷 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalDocumentView
      document={TERMS_OF_SERVICE}
      extra={
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-100">
            유료 서비스 요금 및 혜택
          </h2>
          <p className="text-[12px] leading-6 text-zinc-400">
            유료 플랜의 요금과 제공 혜택은 아래 표와 같습니다. 가격은 부가세 포함이며,
            플랜은 마이페이지에서 언제든 변경할 수 있습니다.
          </p>
          <PlanComparisonTable />
          <p className="text-[11px] leading-6 text-zinc-500">
            {PRICING_DOWNGRADE_NOTE}
          </p>
        </section>
      }
    />
  );
}
