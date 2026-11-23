import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 푸시 받을 기기 해제 — { token }. 없는 토큰이어도 200. 토큰은 경로·쿼리에 싣지 않는다(로그에 남지 않게). */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/devices/unregister`,
  });
}
