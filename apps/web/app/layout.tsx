import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { ColorThemeScript } from "@/components/theme/ColorThemeScript";
import { GlobalThemeToggle } from "@/components/theme/GlobalThemeToggle";
import "./globals.css";
import { ExternalBrowserGate } from "./ExternalBrowserGate";

export const metadata: Metadata = {
  title: "하루컷",
  description: "오늘의 인생 네컷을 기록하는 사진 서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ColorThemeScript />
        <ExternalBrowserGate />
        <Suspense fallback={null}>
          <GuestTrialBridge />
        </Suspense>
        {children}
        <GlobalThemeToggle />
      </body>
    </html>
  );
}
