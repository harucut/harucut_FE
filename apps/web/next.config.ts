import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  // 워크스페이스 공통 패키지는 TS 소스로 배포되므로 빌드에서 트랜스파일한다
  transpilePackages: ["@harucut/shared"],
};

export default nextConfig;
