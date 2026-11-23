import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    inquiryId: string;
  }>;
};

/** 문의 상태·담당 메모(ADMIN). */
export async function PATCH(req: Request, context: RouteContext) {
  const { inquiryId } = await context.params;
  const invalidId = validatePublicId(inquiryId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/admin/inquiries/${encodeURIComponent(inquiryId)}`,
  });
}
