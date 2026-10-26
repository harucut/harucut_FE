import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    captureRunId: string;
  }>;
};

/** 회차 종료 + 그 참가자 세션 회수. 부스 기기 자격(X-Booth-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request, context: RouteContext) {
  const { captureRunId } = await context.params;
  const invalidCaptureRunId = validatePublicId(captureRunId);
  if (invalidCaptureRunId) return invalidCaptureRunId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/booth/capture-runs/${encodeURIComponent(captureRunId)}/close`,
    eventCredential: "booth",
  });
}
