import type { Metadata } from "next";

// 인증 페이지는 redirectTo 쿼리 변형으로 중복 수집되므로 검색 색인에서 제외한다
export const metadata: Metadata = {
  title: "회원가입 | 하루컷",
  robots: { index: false, follow: true },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
