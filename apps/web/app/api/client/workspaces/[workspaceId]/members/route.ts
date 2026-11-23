import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/members`,
  });
}
