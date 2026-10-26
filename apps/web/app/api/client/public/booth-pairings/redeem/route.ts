import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 부스 연결 코드 → 기기 토큰. 자격 없음. 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request) {

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/public/booth-pairings/redeem`,
    eventCredential: "none",
  });
}
