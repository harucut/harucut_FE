import { proxyJson, validateEventSlug } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/** 행사 참가 정보(공개). 게시 전·보관 종료는 404. 자격 없음. 쿠키는 넘기지 않는다(ADR-0007). */
export async function GET(req: Request, context: RouteContext) {
  const { slug } = await context.params;
  const invalidSlug = validateEventSlug(slug);
  if (invalidSlug) return invalidSlug;

  return proxyJson(req, {
    method: "GET",
    url: `${BASE_URL}/api/public/events/${encodeURIComponent(slug)}`,
    eventCredential: "none",
  });
}
