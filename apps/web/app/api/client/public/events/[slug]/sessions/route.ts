import { proxyJson, validateEventSlug } from "@/app/api/client/_proxy";

export const runtime = "edge";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/** BYOD 참가자 세션 발급 — RESTRICTED 로 시작한다. 자격 없음. 쿠키는 넘기지 않는다(ADR-0007). */
export async function POST(req: Request, context: RouteContext) {
  const { slug } = await context.params;
  const invalidSlug = validateEventSlug(slug);
  if (invalidSlug) return invalidSlug;

  return proxyJson(req, {
    method: "POST",
    url: `${BASE_URL}/api/public/events/${encodeURIComponent(slug)}/sessions`,
    eventCredential: "none",
  });
}
