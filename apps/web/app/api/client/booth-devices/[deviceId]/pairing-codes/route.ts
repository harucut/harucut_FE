import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = { params: Promise<{ deviceId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const { deviceId } = await context.params;
  const invalidId = validatePublicId(deviceId);
  if (invalidId) return invalidId;
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/booth-devices/${encodeURIComponent(deviceId)}/pairing-codes`,
  });
}
