import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    mediaId: string;
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  const { mediaId } = await context.params;

  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/media/${encodeURIComponent(mediaId)}/download-url`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
