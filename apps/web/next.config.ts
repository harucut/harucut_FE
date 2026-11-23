import type { NextConfig } from "next";

// 전 경로 공통 보안 응답 헤더.
// CSP(script-src)는 인라인 테마 부트스트랩 스크립트(ColorThemeScript) 때문에 nonce 설계가
// 필요하므로 별도 과제로 미룬다. 대신 클릭재킹/스니핑/전송보안 등 깨질 위험 없는 헤더만 적용한다.
// 촬영(getUserMedia)에 카메라가 필요하므로 Permissions-Policy는 camera=(self)로 허용한다.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
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
  /*
    만들기 흐름 주소는 2026-11-15 `/shoot`(촬영)에서 `/create`(만들기)로 옮겼다 — 사진을 찍든 갤러리에서
    불러오든 같은 흐름이라 「촬영」이 맞지 않았다(사용자 「프레임 고르는 걸 /shoot 이라고 안 하고 만드는 걸로 해서
    통일」). 예전 주소(북마크·앱에 남은 기록·오래된 링크)는 새 주소로 넘긴다. 쿼리는 그대로 따라간다.
    따로 있던 갤러리 불러오기 화면(`/shoot/upload`)은 없어졌다 — 불러오기로 시작하는 프레임 고르기로 보낸다.
    임시 이동(307)으로 둔다 — 브라우저가 기억하지 않아 다시 바꿀 수 있다.
  */
  async redirects() {
    return [
      { source: "/shoot/upload", destination: "/create?source=upload", permanent: false },
      { source: "/shoot", destination: "/create", permanent: false },
      { source: "/shoot/:path*", destination: "/create/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      // Studio 의 행사 화면 미리보기만 같은 출처의 iframe 에 뜰 수 있다. 데이터 없이, 부모가 보낸 값만 그린다.
      { source: "/:path((?!booth/preview).*)", headers: SECURITY_HEADERS },
      {
        source: "/booth/preview",
        headers: SECURITY_HEADERS.map((header) =>
          header.key === "X-Frame-Options"
            ? { key: "X-Frame-Options", value: "SAMEORIGIN" }
            : header.key === "Content-Security-Policy"
              ? { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" }
              : header,
        ),
      },
      /*
        결과 수령 화면. 같은 키는 뒤 규칙이 이긴다(설치된 Next 문서 next-config-js/headers.md:47) —
        전역의 strict-origin-when-cross-origin 을 no-referrer 로 덮는다(기획 R5 16절).
        - 토큰은 fragment 라 Referer 에 실리지 않지만, 경로 자체도 남의 사이트로 넘기지 않는다.
        - no-store: 공유 캐시에 결과 화면을 남기지 않는다.
        - X-Robots-Tag: 색인 금지. robots.txt 로 막지 않는 이유 — 막으면 크롤러가 이 헤더와
          noindex 를 읽지 못해 주소만 색인될 수 있다(R5 16절, Google 「block indexing」).
      */
      {
        source: "/r",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // 초대 링크(/invite#<token>)도 토큰이 곧 권한이다. 결과 링크와 같은 이유로 막는다.
      {
        source: "/invite",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // 사진 공유 링크(/s/<token>, 2026-11-16)도 주소가 곧 사진을 보는 권한이다. 토큰이 경로에 있어(미리보기 수집기가 og:image 를
      // 가져가야 한다) 더더욱 리퍼러로 넘기지 않는다. 그림·내려받기 주소(/s/<token>/image·/download)도 같다.
      {
        source: "/s/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // public/ 의 정적 자산에는 캐시 정책이 없어 매 방문마다 다시 받아왔다.
      // 스티커 PNG 30장·OG 이미지·셔터음이 여기 들어 있다. 파일명에 해시가 없어
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
        source: "/:file(og-image.png|shutter.mp3)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=86400",
          },
        ],
      },
      // 아이콘·매니페스트는 훨씬 덜 바뀐다.
      {
        source: "/:file(favicon.ico|favicon-16x16.png|favicon-32x32.png|apple-touch-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|site.webmanifest)",
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
