import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ userId: string }> };

/** 플랫폼 CMS — 계정 정지 해제. 사유는 감사 로그에 남는다. */
export async function POST(req: Request, context: RouteContext) {
  const { userId } = await context.params;
  const invalidId = validatePublicId(userId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/users/${encodeURIComponent(userId)}/unblock`,
  });
}
