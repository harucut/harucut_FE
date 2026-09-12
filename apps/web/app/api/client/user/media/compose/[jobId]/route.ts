import { buildResponse, forward } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

/** 합성 Job 상태 폴링. status 는 PENDING · DONE · FAILED 셋뿐이다(RUNNING 은 없다). */
export async function GET(req: Request, context: RouteContext) {
  const { jobId } = await context.params;

  const upstream = await forward(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/media/compose/${encodeURIComponent(jobId)}`,
    forwardBody: false,
  });

  return buildResponse(upstream, req);
}
