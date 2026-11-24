import { proxyJson } from "@/app/api/client/_proxy";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 플랫폼 CMS — 조직 공간 찾기(이름·OWNER 이메일). 검색어(query)만 넘긴다. ADMIN 은 백엔드가 본다. */
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("query")?.trim().slice(0, 100) ?? "";
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/admin/workspaces?${new URLSearchParams({ query }).toString()}`,
  });
}
