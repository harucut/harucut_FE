import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    entitlementId: string;
  }>;
};

/** 회수 영향 미리보기(ADMIN) — 운영 중 행사·열린 예약. */
export async function GET(req: Request, context: RouteContext) {
  const { entitlementId } = await context.params;
  const invalidId = validatePublicId(entitlementId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/admin/entitlements/${encodeURIComponent(entitlementId)}/impact`,
  });
}
