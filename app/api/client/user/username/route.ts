import { NextResponse } from "next/server";

export const runtime = "edge";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 사용자 이름 변경 프록시 */
export async function PATCH(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

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

  const url = new URL(`${BASE_URL}/api/auth/user/change/`);
  url.searchParams.set("username", username.trim());

  const upstream = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      cookie,
    },
    cache: "no-store",
  });

  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
