import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "초대 받기",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
