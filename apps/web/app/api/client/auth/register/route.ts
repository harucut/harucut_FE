import { proxyJson } from "@/app/api/client/_proxy";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 회원가입 프록시 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/harucut/register`,
    stripAuthCookies: true,
  });
}
