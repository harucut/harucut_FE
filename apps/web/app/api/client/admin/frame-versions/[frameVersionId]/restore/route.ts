import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ frameVersionId: string }> };

/** 시스템 프레임 발행본 회수 되돌리기. */
export async function POST(req: Request, context: RouteContext) {
  const { frameVersionId } = await context.params;
  const invalidId = validateResourceId(frameVersionId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/frame-versions/${encodeURIComponent(frameVersionId)}/restore`,
  });
}
