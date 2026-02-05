import { NextResponse } from "next/server";
import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 사용자 이름 변경 프록시 */
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

  const url = new URL(`${BASE_URL}/api/auth/user/change/`);
  url.searchParams.set("username", username.trim());

  const upstream = await forward(req, {
    method: "PATCH",
    url: url.toString(),
    forwardBody: false,
  });

  return buildResponse(upstream);
}
