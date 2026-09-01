import { NextResponse } from "next/server";
import { forward } from "@/app/api/client/_proxy";
import { adaptSetCookiesForRequest } from "@/lib/server/setCookies";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

function readUserStatus(body: string) {
  try {
    const parsed = JSON.parse(body) as { data?: { userStatus?: unknown } };
    const status = parsed?.data?.userStatus;
    return typeof status === "string" ? status : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  // 세션 인증 여부는 프론트에서 쿠키 존재를 직접 판단하지 않고 백엔드(/api/auth/status)에
  // 위임한다. 쿠키가 남아있어도 만료/무효일 수 있으므로, 실제 유효성만 신뢰한다.
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/status`,
    forwardBody: false,
  });

  // 200 이라고 앱을 쓸 수 있는 것은 아니다.
  //
  // 탈퇴요청(DELETED_REQUESTED) 계정도 /api/auth/status 는 **200 으로 통과한다** — 복구
  // 안내로 갈 수 있게 서버가 일부러 열어 둔 예외다. 그런데 일반 API 는 전부 403(GEN-021)이라,
  // 여기서 200 을 곧 authenticated 로 읽으면 useRedirectIfAuthenticated 가 그 사용자를
  // 로그인 화면에서 /home 으로 쫓아내고, /home 은 아무것도 못 불러 다시 로그인으로 돌아온다.
  // 즉 복구하러 온 사람이 두 화면 사이를 무한히 왕복한다.
  //
  // 그래서 앱을 쓸 수 없는 상태를 **명시적으로 짚어** 거른다.
  // 반대로 상태를 못 읽었을 때(파싱 실패·필드 누락)는 예전처럼 200 을 그대로 믿는다 —
  // 여기서 기본값을 "미인증"으로 두면 응답 형태가 조금만 바뀌어도 멀쩡한 사용자가 전부
  // 로그인 화면으로 쫓겨나기 때문이다.
  // 근거: docs/backend-contract.md "탈퇴 요청 → 복구 생애주기"
  const userStatus = upstream.ok ? readUserStatus(upstream.body) : null;
  const unusable =
    userStatus === "DELETED_REQUESTED" ||
    userStatus === "DELETED" ||
    userStatus === "BLOCKED";

  const res = NextResponse.json({
    authenticated: upstream.ok && !unusable,
    userStatus,
  });
  // 백엔드가 토큰을 갱신했다면 set-cookie를 그대로 전달
  for (const cookie of adaptSetCookiesForRequest(upstream.setCookies, req)) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
