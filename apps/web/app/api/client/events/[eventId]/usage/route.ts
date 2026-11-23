import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

/** 행사에 적용된 이용권과 합성 사용량(ADR-0008 §6-3). 운영자 또는 그 행사 사진 권한이 있는 행사 고객. */
export async function GET(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidId = validatePublicId(eventId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/usage`,
  });
}
