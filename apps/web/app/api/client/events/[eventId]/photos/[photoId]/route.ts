import { proxyJson, validatePublicId, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ eventId: string; photoId: string }> };

/** 삭제 요청. 사진함 · 참가자 재방문 목록 · 결과 링크에서 바로 빠진다. */
export async function DELETE(req: Request, context: RouteContext) {
  const { eventId, photoId } = await context.params;
  const invalidId = validatePublicId(eventId) ?? validateResourceId(photoId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "DELETE",
    url: `${BASE_URL}/api/auth/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}`,
  });
}
