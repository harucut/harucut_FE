import { proxyJson } from "@/app/api/client/_proxy";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 이메일 인증 코드 검증 프록시 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/email-auth/verification`,
    stripAuthCookies: true,
  });
}
