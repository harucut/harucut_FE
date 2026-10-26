import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

async function forwardDraft(req: Request, context: RouteContext, method: "GET" | "PUT" | "DELETE") {
  const { draftId } = await context.params;
  const invalidId = validatePublicId(draftId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/user/frame-drafts/${encodeURIComponent(draftId)}`,
  });
}

export async function GET(req: Request, context: RouteContext) {
  return forwardDraft(req, context, "GET");
}

export async function PUT(req: Request, context: RouteContext) {
  return forwardDraft(req, context, "PUT");
}

export async function DELETE(req: Request, context: RouteContext) {
  return forwardDraft(req, context, "DELETE");
}
