import type { Metadata } from "next";
import { FeaturesView } from "@/components/features/FeaturesView";

export const metadata: Metadata = {
  title: "기능 | 하루컷",
  description:
    "부스에 가지 않아도 어디서든 네 컷. 스티커·텍스트·누끼로 프레임을 직접 만들고, 찍은 네 컷을 계정에 그대로 보관하세요.",
  alternates: { canonical: "/features" },
};

export default function FeaturesPage() {
  return <FeaturesView />;
}
