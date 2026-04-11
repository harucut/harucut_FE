import { NextResponse } from "next/server";
import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId")?.trim();

  if (!taskId) {
    return NextResponse.json(
      {
        code: "GEN-004",
        status: 400,
        message: "Missing Request Parameter",
      },
      { status: 400 },
    );
  }

  const url = new URL(`${BASE_URL}/api/auth/user/files/transcode/status`);
  url.searchParams.set("taskId", taskId);

  const upstream = await forward(req, {
    method: "GET",
    url: url.toString(),
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
