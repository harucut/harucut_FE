import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 초대 토큰은 본문으로만 받는다 — 쿼리에 실으면 접근 로그에 남는다. */
export async function POST(req: Request) {
  return proxyJson(req, { method: "POST", url: `${BASE_URL}/api/auth/invitations/preview` });
}
