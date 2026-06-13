import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { ColorThemeScript } from "@/components/theme/ColorThemeScript";
import { ColorThemeSync } from "@/components/theme/ColorThemeSync";
import "./globals.css";
import { ExternalBrowserGate } from "./ExternalBrowserGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.harucut.com"),
  title: "하루컷",
  description: "오늘의 인생 네컷을 기록하는 사진 서비스",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "하루컷 — 오늘 하루를 네 컷으로",
    description: "찍고, 꾸미고, 기록하는 나만의 인생네컷. 하루컷.",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
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
        <ColorThemeSync />
        <ExternalBrowserGate />
        <Suspense fallback={null}>
          <GuestTrialBridge />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
