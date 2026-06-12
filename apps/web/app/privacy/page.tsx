import type { Metadata } from "next";
import { PRIVACY_POLICY } from "@harucut/shared";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | 하루컷",
  description: "하루컷 개인정보 처리방침",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
