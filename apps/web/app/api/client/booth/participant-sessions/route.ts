import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 다음 손님 — 새 참가자 세션(RESTRICTED). 부스 기기 자격(X-Booth-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request) {

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/booth/participant-sessions`,
    eventCredential: "booth",
  });
}
