import { NextResponse } from "next/server";
import { fetchSharedPhoto, type SharedPhoto } from "@/lib/server/mediaShareServer";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

/**
 * 공유한 사진의 새 서명 주소로 보낸다. 부를 때마다 백엔드에 다시 묻는다 — 서명 주소는 몇 분만 열려서, 페이지에 그대로
 * 박으면 링크를 띄워 둔 채 시간이 지나거나 미리보기 수집기가 늦게 오면 깨진다. 링크가 닫혔으면(사진 삭제·보관 기간 지남)
 * 404, 백엔드에 못 닿으면 503 이다.
 */
export async function redirectToSharedPhoto(
  ctx: { params: Promise<{ token: string }> },
  field: keyof Pick<SharedPhoto, "imageUrl" | "downloadUrl">,
) {
  const { token } = await ctx.params;
  const lookup = await fetchSharedPhoto(token);
  if (lookup.status !== "ok") {
    return new NextResponse(null, { status: lookup.status === "closed" ? 404 : 503, headers: HEADERS });
  }
  return NextResponse.redirect(lookup.photo[field], { status: 302, headers: HEADERS });
}
