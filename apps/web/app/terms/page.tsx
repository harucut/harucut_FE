import type { Metadata } from "next";
import { TERMS_OF_SERVICE } from "@harucut/shared";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "서비스 이용약관 | 하루컷",
  description: "하루컷 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_SERVICE} />;
}
