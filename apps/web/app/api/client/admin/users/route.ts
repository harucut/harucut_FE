import { proxyJson } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

/** 플랫폼 CMS — 이메일이 정확히 같은 계정을 찾는다. 없으면 빈 목록. ADMIN 은 백엔드가 본다. */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email")?.trim().slice(0, 254) ?? "";
  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/admin/users?${new URLSearchParams({ email }).toString()}`,
  });
}
