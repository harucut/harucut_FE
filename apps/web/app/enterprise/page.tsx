import type { Metadata } from "next";
import { EnterpriseView } from "@/components/enterprise/EnterpriseView";

export const metadata: Metadata = {
  title: "행사·팬미팅 도입 | 하루컷",
  description:
    "링크와 부스로 운영하는 행사 네 컷. 주최자는 Studio 에서 행사를 만들어 게시하고, 참가자는 가입 없이 자기 휴대폰이나 현장 부스로 찍어 결과 링크로 가져갑니다.",
  alternates: { canonical: "/enterprise" },
};

export default function EnterprisePage() {
  return <EnterpriseView />;
}
