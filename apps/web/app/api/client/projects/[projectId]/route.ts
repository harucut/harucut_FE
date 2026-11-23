import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

/** 프로젝트 수정 — `name`·`brandDefaults`(키마다 머지 패치)·`archived` 중 보낸 것만. */
export async function PATCH(req: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const invalidId = validatePublicId(projectId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}`,
  });
}
