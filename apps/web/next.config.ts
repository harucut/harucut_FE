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
  reactStrictMode: false,
  devIndicators: false,
  // 워크스페이스 공통 패키지는 TS 소스로 배포되므로 빌드에서 트랜스파일한다
  transpilePackages: ["@harucut/shared"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
