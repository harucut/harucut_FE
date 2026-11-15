import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    mediaId: string;
  }>;
};

/** 사진 공유 링크 토큰 — 같은 사진이면 같은 토큰이다(lib/userMediaApi.ts 의 createMediaShareLink). 본문은 없다. */
export async function POST(req: Request, context: RouteContext) {
  const { mediaId } = await context.params;
  const invalidId = validateResourceId(mediaId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "POST",
    forwardBody: false,
    url: `${BASE_URL}/api/auth/user/media/${encodeURIComponent(mediaId)}/share-link`,
  });
}
