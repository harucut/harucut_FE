import { proxyJson, validatePublicId, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string; grantId: string }> };

async function forward(req: Request, context: RouteContext, method: "PATCH" | "DELETE") {
  const { eventId, grantId } = await context.params;
  const invalidId = validatePublicId(eventId) ?? validateResourceId(grantId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/grants/${encodeURIComponent(grantId)}`,
  });
}

export async function PATCH(req: Request, context: RouteContext) {
  return forward(req, context, "PATCH");
}

export async function DELETE(req: Request, context: RouteContext) {
  return forward(req, context, "DELETE");
}
