import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 참가자 세션 복원 — 새로고침·재방문 때 상태·남은 동의·진행 중 회차를 묻는다. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request) {

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/participant/session`,
    eventCredential: "participant",
  });
}
