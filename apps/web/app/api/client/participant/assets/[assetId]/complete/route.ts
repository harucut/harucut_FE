import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    assetId: string;
  }>;
};

/** 촬영 입력 업로드 완료 확인. 참가자 자격(X-Participant-Token). 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request, context: RouteContext) {
  const { assetId } = await context.params;
  const invalidAssetId = validatePublicId(assetId);
  if (invalidAssetId) return invalidAssetId;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/participant/assets/${encodeURIComponent(assetId)}/complete`,
    eventCredential: "participant",
  });
}
