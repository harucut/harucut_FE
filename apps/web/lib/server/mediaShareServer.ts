import { cache } from "react";
import { headers } from "next/headers";
import { isShareToken } from "@/lib/mediaShareLink";

/** 받는 사람 페이지에 그릴 사진. 주소는 짧게 열리는 서명 주소라 화면에 그대로 박지 않는다(아래 SharedPhotoLookup). */
export type SharedPhoto = {
  displayName: string;
  createdAt: string | null;
  imageUrl: string;
  downloadUrl: string;
};

/**
 * - ok: 열린 링크
 * - closed: 없는 토큰·사진 삭제·보관 기간 지남 — 백엔드는 이유를 가르지 않는다(링크가 있었는지 새지 않게)
 * - unavailable: 백엔드에 닿지 못했다. 링크는 멀쩡할 수 있어 「닫혔다」고 말하지 않는다
 */
export type SharedPhotoLookup =
  | { status: "ok"; photo: SharedPhoto }
  | { status: "closed" }
  | { status: "unavailable" };

const SERVER_FETCH_TIMEOUT_MS = 3_000;

/**
 * 공유 링크 하나를 백엔드에 묻는다. 토큰은 경로가 아니라 `Authorization: Bearer` 로 넘긴다 — 행사 결과 토큰과 같다
 * (백엔드 접근 기록에 토큰이 남지 않게). 캐시하지 않는다 — 사진을 지우면 바로 닫혀야 한다.
 *
 * 레이아웃의 행사 조회(lib/event/publicEventServer.ts)처럼 BFF 비밀과 사용자 IP 를 함께 넘긴다. 백엔드의 요청 제한이 이
 * 서버 하나가 아니라 실제 방문자 단위로 걸리게 한다.
 */
export async function fetchSharedPhoto(token: string): Promise<SharedPhotoLookup> {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (!isShareToken(token)) return { status: "closed" };
  if (!base) return { status: "unavailable" };

  const forwarded: Record<string, string> = { authorization: `Bearer ${token}` };
  const secret = process.env.BFF_SHARED_SECRET;
  if (secret) {
    const incoming = await headers();
    const clientIp = incoming.get("x-forwarded-for") ?? incoming.get("x-real-ip");
    if (clientIp) {
      forwarded["x-harucut-bff-secret"] = secret;
      forwarded["x-harucut-client-ip"] = clientIp;
    }
  }

  try {
    const response = await fetch(`${base}/api/public/media-shares`, {
      cache: "no-store",
      headers: forwarded,
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (response.status >= 500) return { status: "unavailable" };
    // 404 MEDIA-002(닫힘·무효 전부)와 429 GEN-061(틀린 토큰을 너무 많이 시도)은 둘 다 닫힌 링크다 — 맞는 토큰은 세지 않아
    // 429 가 나지 않는다(백엔드 feat/media-share-link).
    if (!response.ok) return { status: "closed" };
    const body = (await response.json()) as { data?: Partial<SharedPhoto> | null };
    const data = body.data;
    if (!data?.imageUrl || !data.downloadUrl) return { status: "closed" };
    return {
      status: "ok",
      photo: {
        displayName: data.displayName?.trim() || "하루컷 사진",
        createdAt: data.createdAt ?? null,
        imageUrl: data.imageUrl,
        downloadUrl: data.downloadUrl,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

/** 한 요청 안에서 메타데이터와 본문이 같이 쓴다. 한 번만 묻는다. */
export const loadSharedPhotoOnServer = cache(fetchSharedPhoto);
