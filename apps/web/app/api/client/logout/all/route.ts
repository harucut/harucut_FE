import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 모든 기기에서 로그아웃. `/logout` 은 이 기기 세션만 끊는다(O15). 쿠키 처리는 `/logout` 과 같다. */
export async function DELETE(req: Request) {
  try {
    const upstream = await forward(req, {
      method: "DELETE",
      url: `${BASE_URL}/api/harucut/logout/all`,
      forwardBody: false,
    });

    return buildResponse(upstream, req);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
