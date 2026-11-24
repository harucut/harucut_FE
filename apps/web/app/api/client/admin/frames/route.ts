import { proxyJson } from "@/app/api/client/_proxy";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 시스템 프레임 목록(ADMIN). */
export async function GET(req: Request) {
  return proxyJson(req, { method: "GET", url: `${BASE_URL}/api/admin/frames` });
}
