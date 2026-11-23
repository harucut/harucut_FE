import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    projectId: string;
    userId: string;
  }>;
};

/** 프로젝트 멤버 권한 `{ operations[], permissions[] }` 를 통째로(없으면 만든다, 둘 다 비면 뺀다). */
export async function PUT(req: Request, context: RouteContext) {
  const { projectId, userId } = await context.params;
  const invalidProjectId = validatePublicId(projectId);
  if (invalidProjectId) return invalidProjectId;
  const invalidUserId = validatePublicId(userId);
  if (invalidUserId) return invalidUserId;

  return proxyJson(req, {
    method: "PUT",
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
  });
}

/** 프로젝트 멤버 빼기. */
export async function DELETE(req: Request, context: RouteContext) {
  const { projectId, userId } = await context.params;
  const invalidProjectId = validatePublicId(projectId);
  if (invalidProjectId) return invalidProjectId;
  const invalidUserId = validatePublicId(userId);
  if (invalidUserId) return invalidUserId;

  return proxyJson(req, {
    method: "DELETE",
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
  });
}
