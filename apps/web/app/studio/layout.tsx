import type { Metadata } from "next";

// 운영자 화면이다. 검색에 걸릴 이유가 없다.
export const metadata: Metadata = {
  title: "행사 운영",
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
