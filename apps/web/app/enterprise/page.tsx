import type { Metadata } from "next";
import { EnterpriseView } from "@/components/enterprise/EnterpriseView";

export const metadata: Metadata = {
  title: "행사·팬미팅 도입 | 하루컷",
  description:
    "부스 대신 QR 한 장. 행사 이름과 컷 구성을 맞춘 촬영 주소를 드리면, 참가자는 가입 없이 자기 휴대폰으로 찍어 그 자리에서 가져갑니다.",
  alternates: { canonical: "/enterprise" },
};

export default function EnterprisePage() {
  return <EnterpriseView />;
}
