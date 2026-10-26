import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
    userId: string;
  }>;
};

/** 행사 운영자 배정(OWNER·ADMIN) — `{ operations[] }` 를 통째로, 빈 목록이면 뺀다. 대상은 OPERATOR 멤버(P3-2). */
export async function PUT(req: Request, context: RouteContext) {
  const { eventId, userId } = await context.params;
  const invalidEventId = validatePublicId(eventId);
  if (invalidEventId) return invalidEventId;
  const invalidUserId = validatePublicId(userId);
  if (invalidUserId) return invalidUserId;

  return proxyJson(req, {
    method: "PUT",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/operators/${encodeURIComponent(userId)}`,
  });
}
