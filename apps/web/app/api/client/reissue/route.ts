import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

// 쿠키(refreshToken) 기반 액세스 토큰 재발급. 백엔드가 새 토큰을 Set-Cookie로 내려주므로
// buildResponse가 그 쿠키를 브라우저로 되돌려준다(logout/reactivate와 동일 경로).
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/harucut/reissue`,
    forwardBody: false,
  });
}
