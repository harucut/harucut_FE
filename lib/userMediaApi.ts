"use client";

import { clientApi } from "@/lib/clientApi";
import type { ApiEnvelope, UserMedia, UserMediaType } from "@/lib/api-types";

export async function listMyMedia(type?: UserMediaType) {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await clientApi.get<ApiEnvelope<UserMedia[]>>(
    `/api/client/user/media${query}`,
  );
  return res.data.data ?? [];
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
