import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PricingView } from "@/components/pricing/PricingView";

export const metadata: Metadata = {
  title: "요금제 | 하루컷",
  description:
    "하루컷 요금제 안내. 비회원도 촬영은 무료, 커스텀 프레임·보정·보관 기간은 Free·Plus·Pro 플랜에서 확인하세요.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  // /pricing은 public 라우트(proxy matcher 제외)라 비로그인도 가격표를 볼 수 있다.
  // 다만 상단 네비게이션은 로그인 여부에 맞춰 갈라준다 — 비회원에게 앱 네비(홈·기록·MY)는
  // 보호 라우트로 튕기는 chrome이라 부적절하다. 회원=앱 네비, 비회원=마케팅 헤더(로그인/시작하기).
  const jar = await cookies();
  const authed = Boolean(
    jar.get("accessToken")?.value || jar.get("refreshToken")?.value,
  );
  return <PricingView authed={authed} />;
}
