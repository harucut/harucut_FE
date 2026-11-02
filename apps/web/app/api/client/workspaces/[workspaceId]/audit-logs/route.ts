import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

/** 공간 감사 로그(OWNER·ADMIN). 최신순 50개씩. 커서만 넘긴다. */
export async function GET(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;

  const cursor = new URL(req.url).searchParams.get("cursor")?.trim().slice(0, 200);
  const suffix = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/audit-logs` + suffix,
  });
}
