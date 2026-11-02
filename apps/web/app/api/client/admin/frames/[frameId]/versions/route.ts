import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    frameId: string;
  }>;
};

/** 시스템 프레임 발행(ADMIN). 발행해야 행사에서 고를 수 있다. */
export async function POST(req: Request, context: RouteContext) {
  const { frameId } = await context.params;
  const invalidId = validateResourceId(frameId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/admin/frames/${encodeURIComponent(frameId)}/versions`,
  });
}
