import { proxyJson, validatePublicId, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string; photoId: string }> };

/** 운영자가 이 사진의 결과 링크를 전부 끊는다(오발송 등). 사진은 지우지 않는다. 사유는 감사 로그에 남는다. */
export async function POST(req: Request, context: RouteContext) {
  const { eventId, photoId } = await context.params;
  const invalidId = validatePublicId(eventId) ?? validateResourceId(photoId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}/result-access/revoke`,
  });
}
