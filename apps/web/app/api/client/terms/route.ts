import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 활성 약관 목록 프록시. **인증이 필요 없다** — 가입 화면이 로그인 전에 부른다.
 *
 * 인증 쿠키를 떼고 보낸다. 만료된 토큰이 남아 있으면 백엔드 인증 필터가 먼저 걸러
 * 공개 엔드포인트인데도 401 이 되기 때문이다(다른 비인증 프록시와 같은 이유).
 */
export async function GET(req: Request) {
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/terms`,
    forwardBody: false,
    stripAuthCookies: true,
  });
}
