import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 행사·기업 도입 문의 접수(ADR-0008 §6-1). 로그인 없이 받는다 — 서버가 IP 로 빈도를 막는다(분당 5회). */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/public/inquiries`,
    eventCredential: "none",
  });
}
