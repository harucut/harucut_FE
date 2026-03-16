import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 회원 탈퇴 프록시 + 프론트 쿠키 만료 */
export async function DELETE(req: Request) {
  try {
    const upstream = await forward(req, {
      method: "DELETE",
      url: `${BASE_URL}/api/harucut/exit`,
      forwardBody: false,
    });

    return buildResponse(upstream, req);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
