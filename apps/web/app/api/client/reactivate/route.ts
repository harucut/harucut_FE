import { proxyJson } from "@/app/api/client/_proxy";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/harucut/reactivate`,
    forwardBody: false,
  });
}
