import { NextResponse } from "next/server";
import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 사용자 이름 변경 프록시.
 *
 * 백엔드는 이 값을 **JSON 본문**(ChangeUsernameRequest)으로 받는다. 예전에는 여기서
 * 쿼리스트링(`?username=...`)으로 바꿔 보내고 본문을 버렸는데, 그러면 파싱할 본문이 없어
 * 400 GEN-006("Failed to parse JSON body.")이 돌아온다 — 닉네임 변경이 100% 실패했다.
 * 2026-08-20 실측: 쿼리 → 400 GEN-006 / 본문 → 200. docs/backend-contract.md 참고.
 */
export async function PATCH(req: Request) {
  const { username } = (await req.json()) as { username?: string };

  if (!username?.trim()) {
    return NextResponse.json(
      {
        code: "GEN-004",
        status: 400,
        message: "Missing Request Parameter",
      },
      { status: 400 },
    );
  }

  // 위에서 본문을 이미 읽어 버렸으므로 같은 요청을 그대로 넘길 수 없다.
  // 다듬은 값으로 본문을 새로 만들어 보낸다(쿠키 등 헤더는 그대로 유지).
  const proxied = new Request(req.url, {
    method: "PATCH",
    headers: req.headers,
    body: JSON.stringify({ username: username.trim() }),
  });

  const upstream = await forward(proxied, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/user/change/username`,
  });

  return buildResponse(upstream, req);
}
