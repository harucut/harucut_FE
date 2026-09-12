import type { MetadataRoute } from "next";

const BASE_URL = "https://www.harucut.com";

// 로그인 없이 접근 가능한 공개 페이지만 등록한다 (인증 페이지는 noindex)
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, priority: 1 },
    { url: `${BASE_URL}/features`, priority: 0.7 },
    // 행사(B2B) 랜딩. 결제가 열리기 전까지 실제로 파는 유일한 상품이라 기능 다음으로 둔다.
    { url: `${BASE_URL}/enterprise`, priority: 0.7 },
    { url: `${BASE_URL}/pricing`, priority: 0.6 },
    { url: `${BASE_URL}/faq`, priority: 0.5 },
    { url: `${BASE_URL}/terms`, priority: 0.3 },
    { url: `${BASE_URL}/privacy`, priority: 0.3 },
  ];
}
