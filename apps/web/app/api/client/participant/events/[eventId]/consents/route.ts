import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

/** 참가 동의 기록 — 필수 항목을 모두 같은 버전으로 동의하면 ACTIVE. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidEventId = validatePublicId(eventId);
  if (invalidEventId) return invalidEventId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/participant/events/${encodeURIComponent(eventId)}/consents`,
    eventCredential: "participant",
  });
}
