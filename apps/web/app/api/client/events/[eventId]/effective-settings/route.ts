import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

/** 유효 설정 미리보기 `{ settings, sources }` — 공간 ⊕ 프로젝트 ⊕ 행사, 경로마다 출처. 게시하면 이 값이 들어간다. */
export async function GET(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidId = validatePublicId(eventId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/effective-settings`,
  });
}
