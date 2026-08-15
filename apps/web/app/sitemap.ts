import type { MetadataRoute } from "next";

const BASE_URL = "https://www.harucut.com";

// 로그인 없이 접근 가능한 공개 페이지만 등록한다 (인증 페이지는 noindex)
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, priority: 1 },
    { url: `${BASE_URL}/features`, priority: 0.7 },
    { url: `${BASE_URL}/pricing`, priority: 0.6 },
    { url: `${BASE_URL}/faq`, priority: 0.5 },
    { url: `${BASE_URL}/terms`, priority: 0.3 },
    { url: `${BASE_URL}/privacy`, priority: 0.3 },
  ];
}
