import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    mediaId: string;
  }>;
};

/**
 * 사진 삭제.
 *
 * 404(GEN-031)는 "없는 사진이거나 남의 사진"을 구분하지 않는다 — 남의 것을 지우려 한
 * 사람에게 "그건 존재한다"는 정보를 주지 않으려는 것이다. 화면에서도 구분하지 않는다.
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { mediaId } = await context.params;

  const upstream = await forward(req, {
    method: "DELETE",
    url: `${BASE_URL}/api/auth/user/media/${encodeURIComponent(mediaId)}`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
