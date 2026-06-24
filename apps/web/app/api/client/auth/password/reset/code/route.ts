import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 비밀번호 재설정 전용 코드 발송 프록시 (회원가입용 /api/email-auth/code 와 구분) */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/harucut/reset/password/code`,
    stripAuthCookies: true,
  });
}
