import { proxyJson, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

/** 본인 결과 다운로드 URL(5분) — BYOD 만. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const invalidJobId = validateResourceId(jobId);
  if (invalidJobId) return invalidJobId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/participant/compose-jobs/${encodeURIComponent(jobId)}/download`,
    eventCredential: "participant",
  });
}
