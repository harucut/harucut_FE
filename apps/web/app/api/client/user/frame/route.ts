import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function GET(req: Request) {
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/frame`,
    forwardBody: false,
  });
}

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/frame`,
  });
}
