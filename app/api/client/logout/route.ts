import { NextResponse } from "next/server";
import { forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 로그아웃 프록시 + 프론트 쿠키 만료 */
export async function DELETE(req: Request) {
  try {
    const upstream = await forward(req, {
      method: "DELETE",
      url: `${BASE_URL}/api/harucut/logout`,
      forwardBody: false,
    });

    return NextResponse.json(
      { ok: upstream.ok },
      { status: upstream.ok ? 200 : 400 },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
