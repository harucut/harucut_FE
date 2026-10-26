import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 부스 기기 상태 + 배정 행사 참가 정보. 부스 기기 자격(X-Booth-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request) {

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/booth/me`,
    eventCredential: "booth",
  });
}
