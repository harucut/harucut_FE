import { NextResponse } from "next/server";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function DELETE(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

  try {
    const upstream = await fetch(`${BASE_URL}/api/recorday/exit`, {
      method: "DELETE",
      headers: { cookie },
      cache: "no-store",
    });

    const res = NextResponse.json(
      { ok: upstream.ok },
      { status: upstream.ok ? 200 : 400 }
    );

    res.cookies.set("accessToken", "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    res.cookies.set("refreshToken", "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });

    return res;
  } catch {
    const res = NextResponse.json({ ok: false }, { status: 500 });
    res.cookies.set("accessToken", "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    res.cookies.set("refreshToken", "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  }
}
