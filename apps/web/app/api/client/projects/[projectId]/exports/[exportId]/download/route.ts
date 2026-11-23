import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ projectId: string; exportId: string }> };

/** 여러 행사 묶음 받기(P3-5) — 받을 때 기한·담긴 사진·행사마다 권한을 다시 본다. */
export async function POST(req: Request, context: RouteContext) {
  const { projectId, exportId } = await context.params;
  const invalidId = validatePublicId(projectId) ?? validatePublicId(exportId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(exportId)}/download`,
  });
}
