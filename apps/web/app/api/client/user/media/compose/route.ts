import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/**
 * 네컷 서버 합성 접수.
 *
 * 백엔드는 202 로 받고 결과는 나중에 준다 — 응답의 jobId 로 폴링한다(같은 경로의 [jobId]).
 * 본문: { frameId, sourceKeys(4개), idempotencyKey, backgroundColor? }
 */
export async function POST(req: Request) {
  const upstream = await forward(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/media/compose`,
  });

  return buildResponse(upstream, req);
}
