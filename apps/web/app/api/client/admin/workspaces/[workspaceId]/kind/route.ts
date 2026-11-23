import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ workspaceId: string }> };

/** 플랫폼 CMS — 공간 종류(업체/주최자) 설정. 업체 공간은 멤버가 사진을 받지 않는다. 사유는 감사 로그에 남는다. */
export async function PATCH(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/admin/workspaces/${encodeURIComponent(workspaceId)}/kind`,
  });
}
