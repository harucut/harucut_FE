import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ workspaceId: string }> };

async function forward(req: Request, context: RouteContext, method: "GET" | "POST") {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/events`,
  });
}

export async function GET(req: Request, context: RouteContext) {
  return forward(req, context, "GET");
}

export async function POST(req: Request, context: RouteContext) {
  return forward(req, context, "POST");
}
