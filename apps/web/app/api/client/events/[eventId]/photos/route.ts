import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 사진함 목록 쿼리 중 백엔드에 넘기는 것. 그 밖의 키는 버린다. */
const ALLOWED_QUERY = ["cursor", "limit", "from", "to", "channel", "frameVersionId", "status"] as const;

type RouteContext = { params: Promise<{ eventId: string }> };

export async function GET(req: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const invalidId = validatePublicId(eventId);
  if (invalidId) return invalidId;
  const incoming = new URL(req.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ALLOWED_QUERY) {
    const value = incoming.get(key);
    if (value) query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/photos` + suffix,
  });
}
