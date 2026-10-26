import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidId = validatePublicId(eventId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/clone`,
  });
}
