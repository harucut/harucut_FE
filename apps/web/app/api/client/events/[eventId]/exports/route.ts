import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string }> };

async function forward(req: Request, context: RouteContext, method: "GET" | "POST") {
  const { eventId } = await context.params;
  const invalidId = validatePublicId(eventId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method,
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/exports`,
  });
}

/** 내가 만든 최근 묶음(다른 사람의 것은 보이지 않는다). */
export async function GET(req: Request, context: RouteContext) {
  return forward(req, context, "GET");
}

/** 묶음 만들기 — 202 로 바로 돌아오고 압축은 서버 작업이 맡는다. */
export async function POST(req: Request, context: RouteContext) {
  return forward(req, context, "POST");
}
