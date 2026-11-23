import { proxyJson, validatePublicId, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
    frameVersionId: string;
  }>;
};

/** 회차에 제공된 발행 프레임만. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request, context: RouteContext) {
  const { eventId, frameVersionId } = await context.params;
  const invalidEventId = validatePublicId(eventId);
  if (invalidEventId) return invalidEventId;
  const invalidFrameVersionId = validateResourceId(frameVersionId);
  if (invalidFrameVersionId) return invalidFrameVersionId;
  const incoming = new URL(req.url).searchParams;
  const search = new URLSearchParams();
  const captureRunId = incoming.get("captureRunId");
  if (captureRunId !== null) search.set("captureRunId", captureRunId);
  const query = search.size > 0 ? `?${search.toString()}` : "";

  return proxyJson(req, {
    method: "GET",
    // 쿼리는 템플릿 밖에서 붙인다 — 계약 검사(scripts/check_backend_contract.py)가 템플릿 속 ${…} 를 경로 변수로 읽는다.
    url: `${BASE_URL}/api/participant/events/${encodeURIComponent(eventId)}/frame-versions/${encodeURIComponent(frameVersionId)}` + query,
    eventCredential: "participant",
  });
}
