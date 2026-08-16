import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { SessionExpiryBridge } from "@/components/auth/SessionExpiryBridge";
import { ColorThemeScript } from "@/components/theme/ColorThemeScript";
import { ColorThemeSync } from "@/components/theme/ColorThemeSync";
import "./globals.css";
import { ExternalBrowserGate } from "./ExternalBrowserGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.harucut.com"),
  title: "하루컷",
  description: "하루의 인생 네컷을 기록하는 사진 서비스",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "하루컷 — 하루를 네 컷으로",
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
  // standalone(홈 화면 설치)로 뜨면 노치·홈 인디케이터 영역까지 화면이 된다.
  // cover 를 켜야 env(safe-area-inset-*) 가 실제 값을 갖는다.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          Pretendard 웹폰트를 직접 로드해 방문자 OS에 설치 여부와 무관하게
          어디서나 동일하게 렌더되도록 한다(dynamic-subset = 필요한 글리프만 로드).
        */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>
        <ColorThemeScript />
        <ColorThemeSync />
        <ExternalBrowserGate />
        <Suspense fallback={null}>
          <GuestTrialBridge />
        </Suspense>
        <Suspense fallback={null}>
          <SessionExpiryBridge />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
