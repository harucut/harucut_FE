import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

/** 이 행사에서 만든 본인 결과 목록 — BYOD 만. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidEventId = validatePublicId(eventId);
  if (invalidEventId) return invalidEventId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/participant/events/${encodeURIComponent(eventId)}/results`,
    eventCredential: "participant",
  });
}
