import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { TERMS_OF_SERVICE } from "@harucut/shared";
import { LegalDocumentView } from "@/components/legal/LegalDocumentView";

export const metadata: Metadata = {
  title: "서비스 이용약관 | 하루컷",
  description: "하루컷 서비스 이용약관",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  // 마이페이지 약관 동의의 「보기」로 들어오는 사람은 로그인 상태다. 셸을 갈라 사용자
  // 테마와 앱 네비를 지킨다 — 판정은 /pricing 과 같은 쿠키 유무다.
  const jar = await cookies();
  const authed = Boolean(
    jar.get("accessToken")?.value || jar.get("refreshToken")?.value,
  );
  return (
    <LegalDocumentView
      document={TERMS_OF_SERVICE}
      authed={authed}
      extra={
        // 결제가 아직 열리지 않아 약관에 확정 가격표를 두지 않는다. 요금제 안내로만 연결.
        <section className="flex flex-col gap-3 rounded-2xl border border-(--hc-border) bg-(--hc-surface) p-5">
          <h2 className="text-sm font-semibold text-(--hc-text)">
            유료 서비스 요금 및 혜택
          </h2>
          <p className="text-[12px] leading-6 text-(--hc-muted)">
            유료 플랜의 종류와 제공 혜택은{" "}
            <Link
              href="/pricing"
              className="font-semibold text-(--hc-text) underline underline-offset-4"
            >
              요금제 안내
            </Link>
            에서 확인할 수 있어요.
          </p>
          <p className="text-[11px] leading-6 text-(--hc-muted)">
            결제 기능은 준비 중이에요. 요금·결제주기 등 확정 조건은 결제가 열리는
            시점에 요금제 화면에서 안내해요.
          </p>
        </section>
      }
    />
  );
}
