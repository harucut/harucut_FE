import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 이용권 목록(ADMIN). */
export async function GET(req: Request) {
  return proxyJson(req, { method: "GET", url: `${BASE_URL}/api/admin/entitlements` });
}

/** 수동 이용권 부여(ADMIN) — 사유 필수. */
export async function POST(req: Request) {
  return proxyJson(req, { method: "POST", url: `${BASE_URL}/api/admin/entitlements` });
}
