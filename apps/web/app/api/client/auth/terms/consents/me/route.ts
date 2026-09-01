import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 내 약관 동의 상태 프록시 (활성 약관 전체 기준). */
export async function GET(req: Request) {
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/terms/consents/me`,
    forwardBody: false,
  });
}
