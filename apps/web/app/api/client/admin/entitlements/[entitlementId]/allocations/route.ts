import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    entitlementId: string;
  }>;
};

/** 기업 총량에서 행사 하나에 배분(ADMIN, P3-4). 합이 총량을 넘으면 409 ENT-005. */
export async function POST(req: Request, context: RouteContext) {
  const { entitlementId } = await context.params;
  const invalidId = validatePublicId(entitlementId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/entitlements/${encodeURIComponent(entitlementId)}/allocations`,
  });
}
