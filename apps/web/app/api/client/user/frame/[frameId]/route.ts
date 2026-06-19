import { buildResponse, forward, proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    frameId: string;
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  const { frameId } = await context.params;

  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}

export async function PUT(req: Request, context: RouteContext) {
  const { frameId } = await context.params;

  return proxyJson(req, {
    method: "PUT",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
  });
}

export async function DELETE(req: Request, context: RouteContext) {
  const { frameId } = await context.params;

  const upstream = await forward(req, {
    method: "DELETE",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
