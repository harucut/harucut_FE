import type { Metadata } from "next";
import "./globals.css";
import { ExternalBrowserGate } from "./ExternalBrowserGate";

export const metadata: Metadata = {
  title: "recorday",
  description: "오늘의 인생네컷을 기록하는 웹 서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <ExternalBrowserGate />
        {children}
      </body>
    </html>
  );
}
