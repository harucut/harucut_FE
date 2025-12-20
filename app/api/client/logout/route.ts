import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function DELETE(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";

  try {
    const upstream = await fetch(`${BASE_URL}/api/recorday/logout`, {
      method: "DELETE",
      headers: {
        cookie,
      },
      cache: "no-store",
    });

    // 백엔드 응답이 200이든 아니든, 프론트 쿠키는 안전하게 만료
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
