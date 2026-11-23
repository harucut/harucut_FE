import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

/** 프로젝트 멤버 목록(OWNER·ADMIN) — 운영 권한·사진 권한(P3-2). */
export async function GET(req: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const invalidProjectId = validatePublicId(projectId);
  if (invalidProjectId) return invalidProjectId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}/members`,
  });
}
