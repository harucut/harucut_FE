import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    mediaId: string;
  }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  const { mediaId } = await context.params;
  const invalidId = validateResourceId(mediaId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/user/media/${encodeURIComponent(mediaId)}/display-name`,
  });
}
