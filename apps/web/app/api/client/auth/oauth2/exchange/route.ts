import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 앱 로그인 일회용 코드 교환(P4) — 시스템 브라우저에서 받은 코드와 PKCE verifier 를 세션 쿠키로 바꾼다.
 * 응답 쿠키는 로그인과 같은 계약이다. WebView 안에서 불러야 쿠키가 WebView 저장소에 남는다.
 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/harucut/oauth2/exchange`,
    stripAuthCookies: true,
  });
}
