import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 플랫폼 CMS — 문의 목록(ADMIN). 권한은 백엔드가 /api/admin/** 전체에서 본다. */
export async function GET(req: Request) {
  return proxyJson(req, { method: "GET", url: `${BASE_URL}/api/admin/inquiries` });
}
