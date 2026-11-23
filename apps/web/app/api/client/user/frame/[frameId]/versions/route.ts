import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ frameId: string }> };

async function forward(req: Request, context: RouteContext, method: "GET" | "POST") {
  const { frameId } = await context.params;
  const invalidId = validateResourceId(frameId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/user/frame/${encodeURIComponent(frameId)}/versions`,
  });
}

export async function GET(req: Request, context: RouteContext) {
  return forward(req, context, "GET");
}

/** 지금 저장된 프레임을 고칠 수 없는 발행본으로 고정한다. 행사에는 발행본을 연결한다. */
export async function POST(req: Request, context: RouteContext) {
  return forward(req, context, "POST");
}
