"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserMedia, UserMediaType } from "@/lib/api-types";

export async function listMyMedia(type?: UserMediaType) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  // 백엔드 응답의 data는 페이지네이션 객체({ content: [...] })이거나(현행) 배열일 수 있어
  // 양쪽을 모두 방어해 항상 배열을 반환한다. (이전엔 객체를 그대로 반환해 [...] 시 크래시)
  const res = await clientApi.get<
    ApiEnvelope<{ content?: UserMedia[] } | UserMedia[] | null>
  >(`/api/client/user/media${query}`);
  const data = res.data.data;
  if (Array.isArray(data)) return data;
  return data?.content ?? [];
}

export async function registerUserMedia(args: {
  mediaType: UserMediaType;
  s3Key: string;
  displayName?: string;
}) {
  const res = await clientApi.post<ApiEnvelope<UserMedia>>("/api/client/user/media", args);
  return res.data.data;
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
