import type { Metadata } from "next";
import { PricingView } from "@/components/pricing/PricingView";

export const metadata: Metadata = {
  title: "요금제 | 하루컷",
  description:
    "하루컷 요금제 안내. 비회원도 촬영은 무료, 저장·영상·보관은 BASIC·PLUS·PRO 플랜에서 누려보세요.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingView />;
}
