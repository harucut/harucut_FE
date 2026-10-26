import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    entitlementId: string;
  }>;
};

/** 행사 배분량 바꾸기(ADMIN, P3-4). 늘리면 409 ENT-005, 사용·예약 아래로 줄이면 409 ENT-006. */
export async function PATCH(req: Request, context: RouteContext) {
  const { entitlementId } = await context.params;
  const invalidId = validatePublicId(entitlementId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/admin/entitlements/${encodeURIComponent(entitlementId)}`,
  });
}
