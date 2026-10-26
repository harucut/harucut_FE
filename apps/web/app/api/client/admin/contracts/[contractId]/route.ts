import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

/** 계약 상태 전이(ADMIN). ACTIVE 로 바꾸면 이용권이 생긴다. */
export async function PATCH(req: Request, context: RouteContext) {
  const { contractId } = await context.params;
  const invalidId = validatePublicId(contractId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/admin/contracts/${encodeURIComponent(contractId)}`,
  });
}
