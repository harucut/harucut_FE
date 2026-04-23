import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const authenticated =
    cookieHeader.includes("accessToken=") || cookieHeader.includes("refreshToken=");

  return NextResponse.json({ authenticated });
}
