import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 결과 상태·행사 테마 — 토큰은 Authorization 헤더로만 받는다. 결과 토큰(Authorization Bearer). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request) {

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/public/results`,
    eventCredential: "result",
  });
}
