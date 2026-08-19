"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserMedia } from "@/lib/api-types";

export async function listMyMedia() {
  // 백엔드 GET /api/auth/user/media는 page(0부터)/size(기본 10) 기반 페이지네이션이라
  // 모든 페이지를 순회해 전체 미디어를 모은다. (이전엔 첫 페이지 10개 외 항목이 누락됐다)
  // data는 페이지네이션 객체({ content, totalPages, number })이거나(현행) 배열일 수 있어
  // 양쪽을 모두 방어한다. (이전엔 객체를 그대로 반환해 [...] 시 크래시)
  // 미디어는 사진 전용이라 type 필터는 두지 않는다.
  const out: UserMedia[] = [];
  let page = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", "100");
    const res = await clientApi.get<
      ApiEnvelope<
        | { content?: UserMedia[]; totalPages?: number; number?: number }
        | UserMedia[]
        | null
      >
    >(`/api/client/user/media?${params.toString()}`);
    const data = res.data.data;
    if (Array.isArray(data)) return data;
    out.push(...(data?.content ?? []));
    const current = data?.number ?? page;
    const totalPages = data?.totalPages ?? current + 1;
    if (current + 1 >= totalPages) break;
    page = current + 1;
  }
  return out;
}

/**
 * 방금 만들어진 미디어 한 건을 찾는다.
 *
 * 단건 조회 엔드포인트가 없어서 목록에서 고른다. 합성 결과는 항상 최신이라
 * 첫 페이지에 들어온다. 못 찾으면 null — 호출부가 download-url 로 폴백한다.
 */
export async function findMyMedia(mediaId: number) {
  const params = new URLSearchParams({ page: "0", size: "50" });
  const res = await clientApi.get<
    ApiEnvelope<{ content?: UserMedia[] } | UserMedia[] | null>
  >(`/api/client/user/media?${params.toString()}`);

  const data = res.data.data;
  const list = Array.isArray(data) ? data : (data?.content ?? []);
  return list.find((item) => item.mediaId === mediaId) ?? null;
}

export async function getMediaDownloadUrl(mediaId: number) {
  const res = await clientApi.get<ApiEnvelope<string>>(
    `/api/client/user/media/${mediaId}/download-url`,
  );
  return res.data.data;
}

export async function updateMediaDisplayName(mediaId: number, displayName: string) {
  const res = await clientApi.patch<ApiEnvelope<UserMedia>>(
    `/api/client/user/media/${mediaId}/display-name`,
    { displayName },
  );
  return res.data.data;
}
