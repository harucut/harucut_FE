import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 계약 목록(ADMIN). */
export async function GET(req: Request) {
  return proxyJson(req, { method: "GET", url: `${BASE_URL}/api/admin/contracts` });
}

/** 계약 만들기(ADMIN) — DRAFT 로 만든다. */
export async function POST(req: Request) {
  return proxyJson(req, { method: "POST", url: `${BASE_URL}/api/admin/contracts` });
}
