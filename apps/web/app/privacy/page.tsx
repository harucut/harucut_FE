import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PRIVACY_POLICY } from "@harucut/shared";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | 하루컷",
  description: "하루컷 개인정보 처리방침",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  // 마이페이지 약관 동의의 「보기」로 들어오는 사람은 로그인 상태다. 셸을 갈라 사용자
  // 테마와 앱 네비를 지킨다 — 판정은 /pricing 과 같은 쿠키 유무다.
  const jar = await cookies();
  const authed = Boolean(
    jar.get("accessToken")?.value || jar.get("refreshToken")?.value,
  );
  return <LegalDocumentView document={PRIVACY_POLICY} authed={authed} />;
}
