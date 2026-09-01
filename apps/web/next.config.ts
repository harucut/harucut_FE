import type { NextConfig } from "next";

// 전 경로 공통 보안 응답 헤더.
// CSP(script-src)는 인라인 테마 부트스트랩 스크립트(ColorThemeScript) 때문에 nonce 설계가
// 필요하므로 별도 과제로 미룬다. 대신 클릭재킹/스니핑/전송보안 등 깨질 위험 없는 헤더만 적용한다.
// 촬영(getUserMedia)에 카메라가 필요하므로 Permissions-Policy는 camera=(self)로 허용한다.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /*
    빌드 산출물 위치를 환경변수로 바꿀 수 있게 둔다.

    `next dev` 는 같은 산출물 디렉터리에 두 번째 인스턴스를 띄우지 못한다. 그래서 개발자가
    브라우저로 보고 있는 서버가 떠 있으면 e2e 가 자기 서버를 못 띄우고, Playwright 는
    reuseExistingServer 로 그 개발 서버를 집어 쓴다 — 로그인 우회가 켜진 서버를.
    e2e 에만 다른 산출물 디렉터리를 주면 둘이 동시에 살 수 있다.
  */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: false,
  devIndicators: false,
  // 워크스페이스 공통 패키지는 TS 소스로 배포되므로 빌드에서 트랜스파일한다
  transpilePackages: ["@harucut/shared"],
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // public/ 의 정적 자산에는 캐시 정책이 없어 매 방문마다 다시 받아왔다.
      // 스티커 PNG 78장·히어로 이미지·셔터음이 여기 들어 있다. 파일명에 해시가 없어
      // 영구 immutable 은 못 주지만, 하루 캐시 + 하루 stale-while-revalidate 로
      // 재방문의 왕복을 없앤다(바꾸면 최대 하루 뒤 반영된다).
      {
        source: "/stickers/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // 소셜 로고 PNG 세 개가 여기 있었다. 이제 인라인 SVG 라 공개 파일이 아니다.
        source: "/:file(hero-image.webp|hero-image.png|og-image.png|shutter.mp3)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=86400",
          },
        ],
      },
      // 아이콘·매니페스트는 훨씬 덜 바뀐다.
      {
        source: "/:file(favicon-16x16.png|favicon-32x32.png|apple-touch-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|site.webmanifest)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
