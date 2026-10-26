import { proxyJson, validatePublicId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

/** 공간(기업) 브랜드 기본값 — 행사 설정의 상속 가능한 필드 중 정한 것만. */
export async function GET(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/brand-defaults`,
  });
}

/** 공간 브랜드 기본값 수정 — 본문이 곧 머지 패치(null 이면 그 키를 지운다). */
export async function PATCH(req: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const invalidId = validatePublicId(workspaceId);
  if (invalidId) return invalidId;

  return proxyJson(req, {
    method: "PATCH",
    url: `${BASE_URL}/api/auth/workspaces/${encodeURIComponent(workspaceId)}/brand-defaults`,
  });
}
