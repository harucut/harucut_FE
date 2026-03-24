import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/status`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
