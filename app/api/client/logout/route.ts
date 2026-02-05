import { NextResponse } from "next/server";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 로그아웃 프록시 + 프론트 쿠키 만료 */
export async function DELETE(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

  try {
    const upstream = await fetch(`${BASE_URL}/api/harucut/logout`, {
      method: "DELETE",
      headers: { cookie },
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
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
