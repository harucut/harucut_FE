import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GuestTrialBridge } from "@/components/guest/GuestTrialBridge";
import { SessionExpiryBridge } from "@/components/auth/SessionExpiryBridge";
import { AccountRecoveryBridge } from "@/components/auth/AccountRecoveryBridge";
import { TermsConsentBridge } from "@/components/terms/TermsConsentBridge";
import { ColorThemeScript } from "@/components/theme/ColorThemeScript";
import { ColorThemeSync } from "@/components/theme/ColorThemeSync";
/*
  Pretendard 는 같은 오리진에서 낸다. 예전에는 jsdelivr <link> 였는데 앱 첫 실행(캐시 없음)에서
  서드파티 DNS·TLS 왕복 뒤 시스템 서체 → Pretendard 스왑이 보였고, CDN 이 막히면 서체가 영구
  폴백됐다. dynamic-subset CSS 를 번들에 넣으면 Next 가 참조된 woff2 조각만 /_next/static 으로 옮긴다.
*/
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
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
  // 시스템 선호 기준 초깃값. 저장된 선호가 다르면 lib/colorTheme.ts 가 첫 페인트 전에 덮어쓴다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
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
        <Suspense fallback={null}>
          <AccountRecoveryBridge />
        </Suspense>
        <Suspense fallback={null}>
          <TermsConsentBridge />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
