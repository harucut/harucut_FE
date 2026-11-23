import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "운영 관리 | 하루컷",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
