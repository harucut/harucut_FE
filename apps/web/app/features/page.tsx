import type { Metadata } from "next";
import { FeaturesView } from "@/components/features/FeaturesView";

export const metadata: Metadata = {
  title: "네컷 촬영·배경·스티커 프레임 꾸미기 | harucut 하루컷",
  description:
    "휴대폰 카메라로 네컷 사진을 찍고 배경·스티커·글자로 나만의 프레임을 만드세요. 결혼식 하객과 여행 중인 연인을 위한 harucut 하루컷의 촬영·꾸미기·저장 기능.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return <FeaturesView />;
}
