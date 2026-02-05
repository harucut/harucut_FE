import { NextResponse } from "next/server";
export const runtime = "edge";
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

// 쿠키 문자열에서 지정한 키 추출
function getCookieValue(cookieHeader: string, name: string) {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * access/refreshToken이 있으면 백엔드 user info로 프록시
 */
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

  // httpOnly 쿠키에서 accessToken 꺼내기
  const accessToken = getCookieValue(cookie, "accessToken");
  const refreshToken = getCookieValue(cookie, "refreshToken");

  // accessToken이 없으면 바로 401/400 처리
  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { code: "AUTH-001", status: 401, message: "NO_TOKEN", data: null },
      { status: 401 },
    );
  }

  const upstream = await fetch(`${BACKEND_BASE_URL}/api/auth/user/info`, {
    method: "GET",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      cookie,
    },
    cache: "no-store",
  });

  const body = await upstream.text();
  const res = new NextResponse(body, { status: upstream.status });

  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      res.headers.append(key, value);
    } else {
      res.headers.set(key, value);
    }
  });

  return res;
}
