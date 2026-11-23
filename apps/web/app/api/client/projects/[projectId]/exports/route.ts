import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ projectId: string }> };

async function forward(req: Request, context: RouteContext, method: "GET" | "POST") {
  const { projectId } = await context.params;
  const invalidId = validatePublicId(projectId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/projects/${encodeURIComponent(projectId)}/exports`,
  });
}

/** 이 프로젝트에서 내가 만든 최근 여러 행사 묶음(P3-5). */
export async function GET(req: Request, context: RouteContext) {
  return forward(req, context, "GET");
}

/** 여러 행사 묶음 만들기 — 담을 행사를 eventIds 로 명시한다. */
export async function POST(req: Request, context: RouteContext) {
  return forward(req, context, "POST");
}
