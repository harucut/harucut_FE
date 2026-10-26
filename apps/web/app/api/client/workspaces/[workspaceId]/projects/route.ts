import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

/** 공간의 프로젝트 목록(최신순, 보관 포함). P3-1 — 조직 공간 OWNER·ADMIN. */
export async function GET(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/projects`,
  });
}

/** 프로젝트 만들기 `{ name, brandDefaults? }`. */
export async function POST(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/projects`,
  });
}
