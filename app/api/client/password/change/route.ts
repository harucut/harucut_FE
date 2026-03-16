import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

export async function PATCH(req: Request) {
  try {
    return await proxyJson(req, {
      method: "PATCH",
      url: `${BASE_URL}/api/harucut/change/password`,
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
