import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ frameId: string; versionNo: string }> };

/** 공간 프레임 발행본 회수 되돌리기. */
export async function POST(req: Request, context: RouteContext) {
  const { frameId, versionNo } = await context.params;
  const invalidId = validateResourceId(frameId) ?? validateResourceId(versionNo);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}/versions/${encodeURIComponent(versionNo)}/restore`,
  });
}
