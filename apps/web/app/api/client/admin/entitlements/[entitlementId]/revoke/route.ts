import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    entitlementId: string;
  }>;
};

/** 이용권 회수(ADMIN) — 사유 필수. */
export async function POST(req: Request, context: RouteContext) {
  const { entitlementId } = await context.params;
  const invalidId = validatePublicId(entitlementId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/entitlements/${encodeURIComponent(entitlementId)}/revoke`,
  });
}
