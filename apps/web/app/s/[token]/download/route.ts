import { NextResponse } from "next/server";
import { fetchSharedPhoto } from "@/lib/server/mediaShareServer";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

/**
 * 공유한 사진 내려받기. 받는 사람 페이지의 「사진 저장」이 쓴다 — 부를 때마다 새 서명 주소(첨부 파일)로 보낸다
 * (이유는 ../image/route.ts). 링크가 닫혔으면 404 다.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const lookup = await fetchSharedPhoto(token);
  if (lookup.status !== "ok") {
    return new NextResponse(null, { status: lookup.status === "closed" ? 404 : 503, headers: HEADERS });
  }
  return NextResponse.redirect(lookup.photo.downloadUrl, { status: 302, headers: HEADERS });
}
