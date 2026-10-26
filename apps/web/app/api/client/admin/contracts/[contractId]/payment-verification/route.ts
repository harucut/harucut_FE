import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    contractId: string;
  }>;
};

/** 계약 결제 다시 확인(ADMIN) — PORTONE 근거를 PortOne 조회로 다시 대조한다. 웹훅이 근거 등록보다 먼저 온 계약용. */
export async function POST(req: Request, context: RouteContext) {
  const { contractId } = await context.params;
  const invalidId = validatePublicId(contractId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/contracts/${encodeURIComponent(contractId)}/payment-verification`,
  });
}
