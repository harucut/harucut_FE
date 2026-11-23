import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** userId 는 회원 public id 또는 `me`(본인 탈퇴). */
type RouteContext = { params: Promise<{ workspaceId: string; userId: string }> };

async function forward(req: Request, context: RouteContext, method: "PATCH" | "DELETE") {
  const { workspaceId, userId } = await context.params;
  const invalidId = validatePublicId(workspaceId) ?? validatePublicId(userId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
  });
}

export async function PATCH(req: Request, context: RouteContext) {
  return forward(req, context, "PATCH");
}

export async function DELETE(req: Request, context: RouteContext) {
  return forward(req, context, "DELETE");
}
