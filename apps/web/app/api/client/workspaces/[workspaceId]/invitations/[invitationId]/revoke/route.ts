import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ workspaceId: string; invitationId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const { workspaceId, invitationId } = await context.params;
  const invalidId = validatePublicId(workspaceId) ?? validatePublicId(invitationId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
  });
}
