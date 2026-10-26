import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string; exportId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const { eventId, exportId } = await context.params;
  const invalidId = validatePublicId(eventId) ?? validatePublicId(exportId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/exports/${encodeURIComponent(exportId)}`,
  });
}
