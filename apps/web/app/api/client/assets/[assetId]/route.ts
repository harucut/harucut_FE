import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

/** 자산 상태와 짧은 조회 URL(VERIFIED 일 때). Studio 테마 편집이 이미 고른 로고·배경을 미리 보여 줄 때 쓴다. */
export async function GET(req: Request, context: RouteContext) {
  const { assetId } = await context.params;
  const invalidId = validatePublicId(assetId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/assets/${encodeURIComponent(assetId)}`,
  });
}
