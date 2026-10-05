import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    frameId: string;
  }>;
};

export async function GET(req: Request, context: RouteContext) {
  const { frameId } = await context.params;
  const invalidId = validateResourceId(frameId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
  });
}

export async function PUT(req: Request, context: RouteContext) {
  const { frameId } = await context.params;
  const invalidId = validateResourceId(frameId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PUT",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
  });
}

export async function DELETE(req: Request, context: RouteContext) {
  const { frameId } = await context.params;
  const invalidId = validateResourceId(frameId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "DELETE",
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}`,
  });
}
