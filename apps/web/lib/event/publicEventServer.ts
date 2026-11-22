import { cache } from "react";
import { bffForwardHeaders } from "@/lib/server/bffForwardHeaders";
import type { PublicEvent } from "@/lib/event/types";

/** 첫 화면을 오래 붙잡지 않는다. 늦으면 브라우저가 받는다(지금까지와 같은 경로). */
const SERVER_FETCH_TIMEOUT_MS = 1_500;

/**
 * 첫 HTML 에 행사 모습을 싣기 위한 서버 조회. 공개 정보만이고 자격을 싣지 않는다. 실패하면 null — 화면이 브라우저에서 다시 받는다.
 * 한 요청 안에서 메타데이터와 본문이 같이 쓰므로 묶는다. 캐시하지 않는다(게시·회수가 바로 반영돼야 한다, R5 303줄).
 */
export const loadPublicEventOnServer = cache(async (slug: string): Promise<PublicEvent | null> => {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!base || !/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const forwarded = await bffForwardHeaders();
  try {
    const response = await fetch(`${base}/api/public/events/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: forwarded,
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: PublicEvent };
    return body.data ?? null;
  } catch {
    return null;
  }
});
