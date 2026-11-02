import { proxyJson, validatePublicId, validateResourceId } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** `frameId` 는 프레임 id(숫자) 또는 `new`(새 프레임 초안)만 넘긴다. 그 밖의 값은 서버도 400 GEN-005 다. */
export async function GET(req: Request) {
  const frameId = new URL(req.url).searchParams.get("frameId");
  if (frameId !== null && frameId !== "new") {
    const invalidId = validateResourceId(frameId);
    if (invalidId) return invalidId;
  }
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (workspaceId !== null) {
    const invalidWorkspace = validatePublicId(workspaceId);
    if (invalidWorkspace) return invalidWorkspace;
  }
  const params = new URLSearchParams();
  if (frameId !== null) params.set("frameId", frameId);
  if (workspaceId !== null) params.set("workspaceId", workspaceId);
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/auth/user/frame-drafts` + query,
  });
}

export async function POST(req: Request) {
  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/auth/user/frame-drafts`,
  });
}
