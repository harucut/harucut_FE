import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 로그아웃 프록시.
 *
 * 쿠키를 만료시키는 것은 백엔드다. 여기서 하는 일은 상류 응답의 `Set-Cookie` 를 현재 호스트에
 * 맞춰 중계하는 것뿐이고(`buildResponse` → `adaptSetCookiesForRequest`), 프록시가 스스로
 * 만드는 쿠키는 없다. 그래서 상류에 닿지 못하면 인증 쿠키는 그대로 남는다 — 호출부는 성공을
 * 확인한 뒤에 이동해야 한다(`components/terms/TermsReconsentDialog.tsx` 의 handleLogout).
 */
export async function DELETE(req: Request) {
  try {
    const upstream = await forward(req, {
      method: "DELETE",
      url: `${BASE_URL}/api/harucut/logout`,
      forwardBody: false,
    });

    return buildResponse(upstream, req);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
