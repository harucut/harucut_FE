import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 전체 감사 로그(ADMIN). 최신순 50개씩. 커서만 넘긴다. */
export async function GET(req: Request) {
  const cursor = new URL(req.url).searchParams.get("cursor")?.trim().slice(0, 200);
  const suffix = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
  return proxyJson(req, { method: "GET", url: `${BASE_URL}/api/admin/audit-logs` + suffix });
}
