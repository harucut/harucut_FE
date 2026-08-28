"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserMedia } from "@/lib/api-types";
import { requireData } from "@/lib/apiEnvelope";

/**
 * 최근 것 몇 장만. **한 페이지만 부른다.**
 *
 * 홈은 최근 4장만 보여주는데 예전에는 `listMyMedia()` 로 보관함 전체를 순차로 긁었다
 * (100건씩 최대 100페이지). 이번 달/이번 주 개수를 프론트가 세느라 그랬는데, 그 숫자를
 * 걷어내면서 전체를 받을 이유도 없어졌다. 기록이 늘수록 첫 화면이 느려지던 자리다.
 */
export async function listRecentMedia(limit = 4) {
  const params = new URLSearchParams();
  params.set("page", "0");
  params.set("size", String(Math.max(1, limit)));
  const res = await clientApi.get<
    ApiEnvelope<{ content?: UserMedia[] } | UserMedia[]>
  >(`/api/client/user/media?${params.toString()}`);
  const data = res.data.data;
  const list = Array.isArray(data) ? data : (data?.content ?? []);
  return list.slice(0, limit);
}

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
  return requireData(res.data, "다운로드 주소");
}

export async function updateMediaDisplayName(mediaId: number, displayName: string) {
  const res = await clientApi.patch<ApiEnvelope<UserMedia>>(
    `/api/client/user/media/${mediaId}/display-name`,
    { displayName },
  );
  return requireData(res.data, "이름을 바꾼 사진");
}

/**
 * 사진 삭제.
 *
 * 404(GEN-031)는 "없는 사진"과 "남의 사진"을 구분하지 않는다. 화면에서도 구분하지 말 것 —
 * 남의 것을 지우려 한 사람에게 "그건 존재한다"고 알려 주는 셈이 된다.
 */
export async function deleteMedia(mediaId: number) {
  await clientApi.delete<ApiEnvelope<null>>(`/api/client/user/media/${mediaId}`);
}
