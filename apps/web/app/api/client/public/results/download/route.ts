import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 결과 다운로드 URL(5분). 결과 토큰(Authorization Bearer). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request) {

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/public/results/download`,
    eventCredential: "result",
  });
}
