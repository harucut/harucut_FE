import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 자유 문구 글꼴 목록(공개, D06). 자격 없음. 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request) {
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/public/text-styles`,
    eventCredential: "none",
  });
}
