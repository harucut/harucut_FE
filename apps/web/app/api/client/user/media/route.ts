import { buildResponse, forward, proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type")?.trim();

  const url = new URL(`${BASE_URL}/api/auth/user/media`);
  if (type) {
    url.searchParams.set("type", type);
  }

  const upstream = await forward(req, {
    method: "GET",
    url: url.toString(),
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/media`,
  });
}
