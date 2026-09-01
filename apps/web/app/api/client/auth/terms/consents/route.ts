import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 약관 동의·철회 프록시.
 *
 * 본문은 **최상위가 배열**이다(`[{code, agreed}, ...]`). 객체로 감싸면 GEN-006 이라
 * 여기서 형태를 바꾸지 않고 그대로 흘려보낸다 — 검증은 lib/termsApi.ts 가 한다.
 */
export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/terms/consents`,
  });
}
