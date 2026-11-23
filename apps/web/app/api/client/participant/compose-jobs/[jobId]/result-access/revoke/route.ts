import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

/** 이 사진의 결과 링크를 전부 끊는다 — BYOD 원 참가자만. 결과 토큰으로는 할 수 없다(R5 208줄). */
export async function POST(req: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const invalidJobId = validateResourceId(jobId);
  if (invalidJobId) return invalidJobId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/participant/compose-jobs/${encodeURIComponent(jobId)}/result-access/revoke`,
    eventCredential: "participant",
  });
}
