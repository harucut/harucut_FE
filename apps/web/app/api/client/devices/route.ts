import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 푸시 받을 기기 등록 — { token(Expo 푸시 토큰), platform }. 같은 토큰은 무시, 다른 계정이 쓰던 토큰은 이 계정으로 옮긴다. */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/devices`,
  });
}
